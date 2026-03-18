import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getBattle, addContender, updateBattleStatus,
  createBattle, getChessGame, saveChessMove, setFinalWinner,
} from "../services/db.js";
import { createInitialChessState, makeMove } from "../services/chess-engine.js";
import { generateBattleId, buildChessContext, ok, err } from "../services/utils.js";

export function registerChessTools(server: McpServer): void {
  registerCreateChessMatch(server);
  registerJoinChessMatch(server);
  registerMakeMove(server);
  registerGetBoard(server);
}

// ─── 1. arena_create_chess_match ──────────────────────────────────────────────

function registerCreateChessMatch(server: McpServer): void {
  server.registerTool(
    "arena_create_chess_match",
    {
      title: "Crear partida de ajedrez",
      description: `Crea una sala de ajedrez en AI Battle Arena. El creador juega con las Blancas (Alpha).
El oponente (Beta/Negras) se une con 'arena_join_chess_match' usando el código de sala.

Args:
  - my_name: Tu nombre visible
  - my_device: Tu cliente de IA (ej: "Claude Desktop · Linux", "ChatGPT Web")

Returns: { battle_id, join_url, my_color, share_message, instructions }`,
      inputSchema: z.object({
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_device: z.string().max(80).default("AI Desktop").describe("Tu cliente de IA"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ my_name, my_device }) => {
      try {
        const id = generateBattleId();
        // topic encodes the mode
        await createBattle(id, "Partida de Ajedrez", 999, "chess");
        await addContender(id, "alpha", my_name, "Blancas \u2654", my_device);
        // Pre-register Beta placeholder
        await addContender(id, "beta", "TBD", "Negras \u265A", "");

        // Initialize chess state
        const initialState = createInitialChessState();
        await saveChessMove(id, initialState, null);

        const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
        return ok({
          battle_id: id,
          my_color: "white",
          join_url: `${baseUrl}/chess/${id}`,
          share_message: `¡Te desafío a una partida de ajedrez en AI Battle Arena! Código: #${id}. Únete en ${baseUrl}`,
          instructions: `Sala #${id} creada. Juegas con las Blancas \u2654. Comparte el código. Una vez que tu oponente se una, usa 'arena_get_board' para ver el tablero y 'arena_make_move' para jugar.`,
        });
      } catch (e) {
        return err(`Error creando partida: ${String(e)}`);
      }
    }
  );
}

// ─── 2. arena_join_chess_match ────────────────────────────────────────────────

function registerJoinChessMatch(server: McpServer): void {
  server.registerTool(
    "arena_join_chess_match",
    {
      title: "Unirse a partida de ajedrez",
      description: `Conecta como Negras (Beta) a una partida de ajedrez existente.

Args:
  - battle_id: Código de sala de 4 caracteres (ej: "A3F9")
  - my_name: Tu nombre visible
  - my_device: Tu cliente de IA

Returns: ChessContext con el tablero inicial y tus instrucciones como Negras \u265A.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_device: z.string().max(80).default("AI Web").describe("Tu cliente de IA"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_device }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`, "Verifica el código e intenta de nuevo.");
        if (battle.game_mode !== "chess") return err(`La sala #${bid} es de debate, no de ajedrez.`);
        if (battle.status !== "waiting") return err(`La partida #${bid} ya está en curso o finalizada.`);

        await addContender(bid, "beta", my_name, "Negras \u265A", my_device);
        await updateBattleStatus(bid, "active");

        const fresh = await getBattle(bid);
        if (!fresh) return err("Error interno al cargar la partida.");
        const context = buildChessContext(fresh, "beta");

        return ok({
          ...context,
          welcome: `¡Bienvenido/a a la partida #${bid}! Juegas con las Negras \u265A. ${fresh.alpha?.name ?? "Blancas"} comienzan. Usa 'arena_get_board' para ver el tablero.`,
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
