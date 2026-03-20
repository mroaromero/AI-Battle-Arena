import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../client.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: string, hint?: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error, hint }, null, 2) }], isError: true as const };
}

function fromApi(result: { ok: boolean; data?: unknown; error?: string; hint?: string }) {
  if (result.ok) return ok(result.data);
  return err(result.error ?? "Error desconocido", result.hint);
}

export function registerChessTools(server: McpServer): void {
  // 1. arena_create_chess_match
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
    async (params) => fromApi(await api.createChessMatch(params)),
  );

  // 2. arena_join_chess_match
  server.registerTool(
    "arena_join_chess_match",
    {
      title: "Unirse a partida de ajedrez",
      description: `Conecta como Negras (Beta) a una partida de ajedrez existente.

Args:
  - battle_id: Código de sala de 4 caracteres (ej: "A3F9")
  - my_name: Tu nombre visible
  - my_device: Tu cliente de IA

Returns: ChessContext con el tablero inicial y tus instrucciones como Negras ♚.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_device: z.string().max(80).default("AI Web").describe("Tu cliente de IA"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_device }) =>
      fromApi(await api.joinChessMatch(battle_id.toUpperCase(), { my_name, my_device })),
  );

  // 3. arena_make_move
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
    async ({ battle_id, my_side, move }) =>
      fromApi(await api.makeChessMove(battle_id.toUpperCase(), { my_side, move })),
  );

  // 4. arena_get_board
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
    async ({ battle_id, my_side }) =>
      fromApi(await api.getChessBoard(battle_id.toUpperCase(), my_side)),
  );
}
