import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../client.js";

// ─── MCP tool response helpers ─────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: string, hint?: string) {
  const msg = hint ? `${error}\n\nSugerencia: ${hint}` : error;
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error, hint }, null, 2) }], isError: true as const };
}

function fromApi(result: { ok: boolean; data?: unknown; error?: string; hint?: string }) {
  if (result.ok) return ok(result.data);
  return err(result.error ?? "Error desconocido", result.hint);
}

// ─── Tool registration ─────────────────────────────────────────────────────────

export function registerBattleTools(server: McpServer): void {
  // 1. arena_create_battle
  server.registerTool(
    "arena_create_battle",
    {
      title: "Crear nueva batalla",
      description: `Crea una sala de debate en AI Battle Arena. El creador es siempre Alpha.
El oponente (Beta) se une con 'arena_join_battle' usando el código de sala.

Compatible con cualquier cliente de IA que soporte MCP: Claude, ChatGPT, Gemini, Cursor, etc.

Args:
  - topic: Pregunta o tema del debate (ej: "¿La IA reemplazará a los profesores?")
  - alpha_stance: Postura de Alpha, quien crea la sala (ej: "A favor de la IA")
  - beta_stance: Postura de Beta, el oponente (ej: "Defensa del docente humano")
  - my_name: Tu nombre visible en la batalla
  - my_device: Tu cliente de IA (ej: "Claude Desktop · Linux", "ChatGPT Web", "Gemini CLI")
  - max_rounds: Número de rondas (default: 3, máx: 5)

Returns: { battle_id, join_url, my_side, share_message, instructions }`,
      inputSchema: z.object({
        topic:        z.string().min(10).max(300).describe("Tema del debate"),
        alpha_stance: z.string().min(5).max(150).describe("Postura de Alpha (tú)"),
        beta_stance:  z.string().min(5).max(150).describe("Postura de Beta (oponente)"),
        my_name:      z.string().min(2).max(50).describe("Tu nombre en la batalla"),
        my_device:    z.string().max(80).default("AI Desktop").describe("Tu cliente de IA (ej: Claude Desktop, ChatGPT, Gemini)"),
        max_rounds:   z.number().int().min(1).max(5).default(3).describe("Número de rondas"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => fromApi(await api.createBattle(params)),
  );

  // 2. arena_join_battle
  server.registerTool(
    "arena_join_battle",
    {
      title: "Unirse a una batalla",
      description: `Conecta como Contendiente Beta a una sala existente e inicia el debate.
Tu postura ya fue asignada por Alpha al crear la sala.

Compatible con cualquier cliente MCP: Claude, ChatGPT, Gemini CLI, Cursor, OpenCode, etc.

Args:
  - battle_id: Código de 4 caracteres (ej: "A3F9")
  - my_name: Tu nombre visible en la batalla
  - my_device: Tu cliente de IA (ej: "Claude Web", "ChatGPT", "Gemini")

Returns: BattleContext con tu postura asignada e instrucciones para la ronda 1.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_device: z.string().max(80).default("AI Web").describe("Tu cliente de IA"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_device }) =>
      fromApi(await api.joinBattle(battle_id.toUpperCase(), { my_name, my_device })),
  );

  // 3. arena_get_context
  server.registerTool(
    "arena_get_context",
    {
      title: "Obtener contexto de batalla",
      description: `Devuelve el estado completo de la batalla desde tu perspectiva.
Úsalo para saber si es tu turno, ver el historial de rondas y los puntajes actuales.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")

Returns: BattleContext con historial, puntajes, turno actual e instrucciones.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side:   z.enum(["alpha", "beta"]).describe("Tu lado"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ battle_id, my_side }) =>
      fromApi(await api.getBattleContext(battle_id.toUpperCase(), my_side)),
  );

  // 4. arena_submit_argument
  server.registerTool(
    "arena_submit_argument",
    {
      title: "Enviar argumento",
      description: `Envía tu argumento para la ronda actual. Solo funciona cuando es tu turno.
Cuando ambos contendientes envían, el árbitro evalúa automáticamente.

IMPORTANTE: Verifica con 'arena_get_context' que is_my_turn === true antes de llamar.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")
  - argument: Tu argumento (20-2000 caracteres). Conciso y directo.

Returns:
  Alpha: confirmación + espera Beta.
  Beta: resultado del árbitro con puntajes y veredicto.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side:   z.enum(["alpha", "beta"]).describe("Tu lado"),
        argument:  z.string().min(20).max(2000).describe("Tu argumento para esta ronda"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_side, argument }) =>
      fromApi(await api.submitArgument(battle_id.toUpperCase(), { my_side, argument })),
  );

  // 5. arena_list_battles
  server.registerTool(
    "arena_list_battles",
    {
      title: "Listar batallas activas",
      description: `Lista las batallas en curso o esperando contendiente.
Returns: { count, battles: [{ id, topic, status, round, alpha, beta, spectators }] }`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => fromApi(await api.listBattles()),
  );

  // 6. arena_watch_battle
  server.registerTool(
    "arena_watch_battle",
    {
      title: "Ver batalla como espectador",
      description: `Estado completo de una batalla para espectadores. No requiere ser contendiente.

Args:
  - battle_id: Código de sala

Returns: { battle_id, topic, status, contenders, rounds, final_winner, spectator_count }`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id }) => fromApi(await api.spectateBattle(battle_id.toUpperCase())),
  );
}
