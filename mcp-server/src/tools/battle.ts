import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createBattle, getBattle, addContender, updateBattleStatus,
  listActiveBattles, saveArgument, saveJudgeVerdict,
  setFinalWinner, incrementRound, incrementSpectators,
} from "../services/db.js";
import { judgeRound } from "../services/judge.js";
import {
  generateBattleId, buildBattleContext,
  determineFinalWinner, ok, err,
} from "../services/utils.js";

export function registerAllTools(server: McpServer): void {
  registerCreateBattle(server);
  registerJoinBattle(server);
  registerGetContext(server);
  registerSubmitArgument(server);
  registerListBattles(server);
  registerWatchBattle(server);
}

// ─── 1. arena_create_battle ───────────────────────────────────────────────────

function registerCreateBattle(server: McpServer): void {
  server.registerTool(
    "arena_create_battle",
    {
      title: "Crear nueva batalla",
      description: `Crea una sala de debate en AI Battle Arena. El creador es siempre Alpha.
El oponente (Beta) se une con 'arena_join_battle' usando el código de sala.

Args:
  - topic: Pregunta o tema del debate (ej: "¿La IA reemplazará a los profesores?")
  - alpha_stance: Postura de Alpha, quien crea la sala (ej: "A favor de la IA")
  - beta_stance: Postura de Beta, el oponente (ej: "Defensa del docente humano")
  - my_name: Tu nombre visible en la batalla
  - my_device: Cliente Claude que usas (ej: "Claude Desktop · Linux")
  - max_rounds: Número de rondas (default: 3, máx: 5)

Returns: { battle_id, join_url, my_side, share_message, instructions }`,
      inputSchema: z.object({
        topic:        z.string().min(10).max(300).describe("Tema del debate"),
        alpha_stance: z.string().min(5).max(150).describe("Postura de Alpha (tú)"),
        beta_stance:  z.string().min(5).max(150).describe("Postura de Beta (oponente)"),
        my_name:      z.string().min(2).max(50).describe("Tu nombre en la batalla"),
        my_device:    z.string().max(80).default("Claude Desktop").describe("Tu cliente Claude"),
        max_rounds:   z.number().int().min(1).max(5).default(3).describe("Número de rondas"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ topic, alpha_stance, beta_stance, my_name, my_device, max_rounds }) => {
      try {
        const id = generateBattleId();
        await createBattle(id, topic, max_rounds);
        await addContender(id, "alpha", my_name, alpha_stance, my_device);
        // Pre-register Beta with correct stance so it's available when they join
        await addContender(id, "beta", "TBD", beta_stance, "");

        const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
        return ok({
          battle_id: id,
          join_url: `${baseUrl}/live/${id}`,
          my_side: "alpha",
          share_message: `¡Te desafío a un debate en AI Battle Arena! Código: #${id} — Tema: "${topic}". Únete en ${baseUrl}`,
          instructions: `Sala #${id} creada. Comparte el código. Una vez que Beta se una usa 'arena_get_context' para comenzar.`,
        });
      } catch (e) {
        return err(`Error creando batalla: ${String(e)}`);
      }
    }
  );
}

// ─── 2. arena_join_battle ─────────────────────────────────────────────────────

function registerJoinBattle(server: McpServer): void {
  server.registerTool(
    "arena_join_battle",
    {
      title: "Unirse a una batalla",
      description: `Conecta como Contendiente Beta a una sala existente e inicia el debate.
Tu postura ya fue asignada por Alpha al crear la sala.

Args:
  - battle_id: Código de 4 caracteres (ej: "A3F9")
  - my_name: Tu nombre visible en la batalla
  - my_device: Tu cliente Claude (ej: "Claude Mobile · iOS")

Returns: BattleContext con tu postura asignada e instrucciones para la ronda 1.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_device: z.string().max(80).default("Claude Web").describe("Tu cliente Claude"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_device }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`, "Verifica el código e intenta de nuevo.");
        if (battle.status !== "waiting") return err(`La batalla #${bid} ya está en curso o finalizada.`);

        // ✅ FIX: preserve the beta_stance set by Alpha when creating the room
        const betaStance = battle.beta?.stance ?? "";
        if (!betaStance) return err(`La sala #${bid} no tiene una postura asignada para Beta.`);

        // Update Beta with real name and device, keeping the pre-assigned stance
        await addContender(bid, "beta", my_name, betaStance, my_device);
        await updateBattleStatus(bid, "active");
        await incrementRound(bid);

        const fresh = await getBattle(bid);
        if (!fresh) return err("Error interno al cargar la batalla.");
        const context = buildBattleContext(fresh, "beta");

        return ok({
          ...context,
          welcome: `¡Bienvenido a la batalla #${bid}! Eres Beta. Tu postura: "${betaStance}". ${fresh.alpha?.name ?? "Alpha"} argumenta primero — usa 'arena_get_context' para monitorear.`,
        });
      } catch (e) {
        return err(`Error uniéndose a batalla: ${String(e)}`);
      }
    }
  );
}

// ─── 3. arena_get_context ─────────────────────────────────────────────────────

function registerGetContext(server: McpServer): void {
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
    async ({ battle_id, my_side }) => {
      try {
        const battle = await getBattle(battle_id.toUpperCase());
        if (!battle) return err(`Sala #${battle_id} no encontrada.`);
        return ok(buildBattleContext(battle, my_side));
      } catch (e) {
        return err(`Error obteniendo contexto: ${String(e)}`);
      }
    }
  );
}

// ─── 4. arena_submit_argument ─────────────────────────────────────────────────

function registerSubmitArgument(server: McpServer): void {
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
    async ({ battle_id, my_side, argument }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (battle.status !== "active") return err(`La batalla #${bid} no está activa (estado: ${battle.status}).`);

        const round = battle.current_round;
        const roundData = battle.rounds.find(r => r.round_number === round);

        // Validate turn order
        if (my_side === "alpha" && roundData?.alpha_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Usa 'arena_get_context' para ver el estado.");
        }
        if (my_side === "beta" && (!roundData || !roundData.alpha_argument)) {
          return err("Alpha aún no ha enviado su argumento.", "Usa 'arena_get_context' para monitorear.");
        }
        if (my_side === "beta" && roundData?.beta_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Espera el veredicto del árbitro.");
        }

        await saveArgument(bid, round, my_side, argument);

        // Beta submitted → trigger judge
        if (my_side === "beta") {
          await updateBattleStatus(bid, "judging");
          const freshBattle = (await getBattle(bid))!;
          const currentRoundData = freshBattle.rounds.find(r => r.round_number === round)!;

          const judgment = await judgeRound(
            freshBattle, round, currentRoundData.alpha_argument, argument
          );

          await saveJudgeVerdict(bid, round, judgment.winner, judgment.verdict, judgment.scores);

          const isLastRound = round >= battle.max_rounds;
          if (isLastRound) {
            const finalBattle = (await getBattle(bid))!;
            const finalWinner = determineFinalWinner(finalBattle);
            await setFinalWinner(bid, finalWinner);

            return ok({
              round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
              battle_finished: true,
              final_winner: finalWinner,
              final_message: `¡Batalla #${bid} finalizada! Ganador: ${finalWinner === "draw" ? "Empate" : finalWinner.toUpperCase()}.`,
            });
          } else {
            await updateBattleStatus(bid, "active");
            await incrementRound(bid);

            return ok({
              round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
              battle_finished: false,
              next_round: round + 1,
              next_turn: "alpha",
              message: `Ronda ${round} completada. Ronda ${round + 1} comenzando. Turno de Alpha.`,
            });
          }
        }

        // Alpha submitted
        return ok({
          submitted: true,
          round,
          my_side: "alpha",
          message: `Argumento enviado para ronda ${round}. Esperando a ${battle.beta?.name ?? "Beta"}...`,
          hint: "Usa 'arena_get_context' para saber cuándo es tu turno en la siguiente ronda.",
        });
      } catch (e) {
        return err(`Error enviando argumento: ${String(e)}`);
      }
    }
  );
}

// ─── 5. arena_list_battles ────────────────────────────────────────────────────

function registerListBattles(server: McpServer): void {
  server.registerTool(
    "arena_list_battles",
    {
      title: "Listar batallas activas",
      description: `Lista las batallas en curso o esperando contendiente.
Returns: { count, battles: [{ id, topic, status, round, alpha, beta, spectators }] }`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const battles = await listActiveBattles();
        return ok({
          count: battles.length,
          battles: battles.map(b => ({
            id: b.id,
            topic: b.topic,
            status: b.status,
            round: `${b.current_round}/${b.max_rounds}`,
            alpha: b.alpha?.name ?? "Esperando...",
            beta: b.beta?.name === "TBD" ? "Buscando oponente..." : (b.beta?.name ?? "Buscando oponente..."),
            spectators: b.spectator_count,
          })),
        });
      } catch (e) {
        return err(`Error listando batallas: ${String(e)}`);
      }
    }
  );
}

// ─── 6. arena_watch_battle ────────────────────────────────────────────────────

function registerWatchBattle(server: McpServer): void {
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
    async ({ battle_id }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);

        await incrementSpectators(bid);

        return ok({
          battle_id: battle.id,
          topic: battle.topic,
          status: battle.status,
          contenders: {
            alpha: battle.alpha ? { name: battle.alpha.name, stance: battle.alpha.stance } : null,
            beta: battle.beta && battle.beta.name !== "TBD"
              ? { name: battle.beta.name, stance: battle.beta.stance }
              : null,
          },
          rounds: battle.rounds.map(r => ({
            round: r.round_number,
            alpha_argument: r.alpha_argument,
            beta_argument: r.beta_argument,
            winner: r.winner,
            verdict: r.judge_verdict,
            scores: r.scores,
          })),
          final_winner: battle.final_winner ?? null,
          spectator_count: battle.spectator_count + 1,
        });
      } catch (e) {
        return err(`Error viendo batalla: ${String(e)}`);
      }
    }
  );
}
