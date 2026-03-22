import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getBattle, addContender, updateBattleStatus,
  getChessGame, saveChessMove, setFinalWinner,
} from "../services/db.js";
import { makeMove } from "../services/chess-engine.js";
import { buildChessContext, ok, err } from "../services/utils.js";

export function registerChessTools(server: McpServer): void {
  registerJoinChessMatch(server);
  registerMakeMove(server);
  registerGetBoard(server);
}

// ─── 1. arena_join_chess_match ────────────────────────────────────────────────

function registerJoinChessMatch(server: McpServer): void {
  server.registerTool(
    "arena_join_chess_match",
    {
      title: "Unirse a partida de ajedrez",
      description: `Conecta a una partida de ajedrez pre-existente creada por el admin.
El primer contendiente que se conecte juega Blancas (Alpha), el segundo juega Negras (Beta).

Args:
  - battle_id: Código de sala proporcionado por el admin (ej: "A3F9")
  - my_name: Tu nombre visible (ej: "Claude", "GPT-4")
  - my_model: Tu modelo de lenguaje (ej: "Opus 4.6", "GPT-4o")

Returns: ChessContext con el tablero y tus instrucciones.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_model:  z.string().max(80).default("Unknown Model").describe("Tu modelo de lenguaje"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_model }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`, "Verifica el código e intenta de nuevo.");
        if (battle.game_mode !== "chess") return err(`La sala #${bid} es de debate, no de ajedrez.`);
        if (battle.status !== "waiting") return err(`La partida #${bid} ya está en curso o finalizada.`);

        // Alpha is the first to join, Beta is the second
        const alphaJoined = battle.alpha?.name !== "Esperando...";
        const side: "alpha" | "beta" = alphaJoined ? "beta" : "alpha";
        const color = side === "alpha" ? "Blancas ♔" : "Negras ♚";

        await addContender(bid, side, my_name, color, my_model);
        if (alphaJoined) {
          await updateBattleStatus(bid, "active");
        }

        const fresh = await getBattle(bid);
        if (!fresh) return err("Error interno al cargar la partida.");
        const context = buildChessContext(fresh, side);

        return ok({
          ...context,
          welcome: `¡Bienvenido/a a la partida #${bid}! Juegas con las ${color} (${my_name} · ${my_model}). ${alphaJoined ? "¡La partida comienza! Usa 'arena_get_board' para ver el tablero." : "Esperando oponente..."}`,
        });
      } catch (e) {
        return err(`Error uniéndose a la partida: ${String(e)}`);
      }
    }
  );
}

// ─── 3. arena_make_move ───────────────────────────────────────────────────────

function registerMakeMove(server: McpServer): void {
  server.registerTool(
    "arena_make_move",
    {
      title: "Hacer movimiento de ajedrez",
      description: `Envía tu movimiento en la partida de ajedrez. Solo funciona en tu turno.

Usa notación algebraica estándar (SAN):
  - Peones: e4, d5, exd5
  - Piezas: Nf3, Bc4, Qd1, Re1
  - Enroque: O-O (corto), O-O-O (largo)
  - Capturas: Nxf7, exd5
  - Jaque: Nf7+
  - Jaque mate: Qh7#
  - Promoción: e8=Q

También acepta formato UCI: e2e4, g1f3, e7e8q

IMPORTANTE: Usa 'arena_get_board' para ver los movimientos legales antes de mover.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha"=Blancas, "beta"=Negras)
  - move: Tu movimiento en SAN o UCI

Returns: Estado actualizado del tablero tras tu movimiento.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side:   z.enum(["alpha", "beta"]).describe("Tu lado (alpha=Blancas, beta=Negras)"),
        move:      z.string().min(2).max(10).describe("Movimiento en SAN (e4, Nf3, O-O) o UCI (e2e4)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_side, move }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (battle.game_mode !== "chess") return err(`La sala #${bid} no es una partida de ajedrez.`);
        if (battle.status !== "active") return err(`La partida #${bid} no está activa (estado: ${battle.status}).`);

        const chess = battle.chess!;
        const myColor = my_side === "alpha" ? "white" : "black";

        // Validate turn
        if (chess.turn !== myColor) {
          const colorName = chess.turn === "white" ? "Blancas (Alpha)" : "Negras (Beta)";
          return err(`No es tu turno. Ahora mueven las ${colorName}.`, "Usa 'arena_get_board' para ver el estado.");
        }

        // Attempt the move
        const result = makeMove(chess.fen, chess.moves, my_side, move);
        if (!result.success || !result.state) {
          return err(result.error ?? "Movimiento inválido.");
        }

        const newState = result.state;
        // Set side_to_move for next player
        newState.side_to_move = newState.turn === "white" ? "alpha" : "beta";

        await saveChessMove(bid, newState, my_side);

        // Check for game over
        if (newState.is_checkmate) {
          await setFinalWinner(bid, my_side);
          return ok({
            move_made: result.state.moves[result.state.moves.length - 1]?.san,
            board: newState,
            game_over: true,
            result: "checkmate",
            winner: my_side,
            message: `¡JAQUE MATE! Ganan las ${myColor === "white" ? "Blancas (Alpha)" : "Negras (Beta)"}. Partida finalizada.`,
          });
        }

        if (newState.is_draw) {
          await setFinalWinner(bid, "draw");
          return ok({
            move_made: result.state.moves[result.state.moves.length - 1]?.san,
            board: newState,
            game_over: true,
            result: "draw",
            draw_reason: newState.draw_reason,
            message: `Partida finalizada en tablas (${newState.draw_reason}).`,
          });
        }

        const nextPlayer = newState.turn === "white" ? "Blancas/Alpha" : "Negras/Beta";
        return ok({
          move_made: result.state.moves[result.state.moves.length - 1]?.san,
          board: newState,
          game_over: false,
          check: newState.is_check,
          next_turn: nextPlayer,
          message: `Movimiento "${result.state.moves[result.state.moves.length - 1]?.san}" realizado.${newState.is_check ? " ⚠️ JAQUE a las " + nextPlayer + "." : ""} Turno de ${nextPlayer}.`,
        });
      } catch (e) {
        return err(`Error realizando movimiento: ${String(e)}`);
      }
    }
  );
}

// ─── 4. arena_get_board ───────────────────────────────────────────────────────

function registerGetBoard(server: McpServer): void {
  server.registerTool(
    "arena_get_board",
    {
      title: "Ver estado del tablero",
      description: `Estado completo de la partida de ajedrez desde tu perspectiva.
Úsalo para ver el tablero, saber si es tu turno, ver movimientos legales e historial.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha"=Blancas, "beta"=Negras)

Returns: ChessContext con FEN, PGN, turno, movimientos legales e historial.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side:   z.enum(["alpha", "beta"]).describe("Tu lado"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ battle_id, my_side }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (battle.game_mode !== "chess") return err(`La sala #${bid} no es una partida de ajedrez.`);
        return ok(buildChessContext(battle, my_side));
      } catch (e) {
        return err(`Error obteniendo tablero: ${String(e)}`);
      }
    }
  );
}
