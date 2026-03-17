import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createBattle, getBattle, addContender, updateBattleStatus,
  listActiveBattles, saveArgument, saveJudgeVerdict,
  setFinalWinner, incrementRound, incrementSpectators
} from "../services/db.js";
import { judgeRound } from "../services/judge.js";
import {
  generateBattleId, buildBattleContext,
  determineFinalWinner, ok, err
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
      description: `Crea una nueva sala de debate en AI Battle Arena y devuelve el ID de sala.
El creador define el tema y asigna las posturas. El oponente debe unirse con 'arena_join_battle'.

Args:
  - topic: El tema o pregunta del debate (ej: "¿La IA reemplazará a los profesores?")
  - alpha_stance: La postura que defenderá el Contendiente Alpha (ej: "A favor de la IA")
  - beta_stance: La postura que defenderá el Contendiente Beta (ej: "Defensa del docente humano")
  - my_name: Nombre del contendiente que crea la sala
  - my_device: Descripción del cliente Claude usado (ej: "Claude Desktop · macOS")
  - max_rounds: Número de rondas del debate (default: 3, máx: 5)

Returns:
  {
    "battle_id": string,    // Código de 4 caracteres para compartir (ej: "A3F9")
    "join_url": string,     // URL para espectadores
    "my_side": "alpha",     // El creador siempre es Alpha
    "instructions": string  // Qué hacer a continuación
  }`,
      inputSchema: z.object({
        topic: z.string().min(10).max(300).describe("Tema o pregunta del debate"),
        alpha_stance: z.string().min(5).max(150).describe("Postura de Alpha (quien crea la sala)"),
        beta_stance: z.string().min(5).max(150).describe("Postura de Beta (el oponente)"),
        my_name: z.string().min(2).max(50).describe("Tu nombre en la batalla"),
        my_device: z.string().max(80).default("Claude Desktop").describe("Cliente Claude que usas"),
        max_rounds: z.number().int().min(1).max(5).default(3).describe("Número de rondas"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ topic, alpha_stance, beta_stance, my_name, my_device, max_rounds }) => {
      try {
        const id = generateBattleId();
        createBattle(id, topic, max_rounds);
        addContender(id, "alpha", my_name, alpha_stance, my_device);

        // Store beta_stance in a second contender row as placeholder
        addContender(id, "beta", "TBD", beta_stance, "");

        const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";

        return ok({
          battle_id: id,
          join_url: `${baseUrl}/live/${id}`,
          my_side: "alpha",
          share_message: `¡Te desafío a un debate en AI Battle Arena! Código: #${id} — Tema: "${topic}". Únete en ${baseUrl}`,
          instructions: `Sala #${id} creada. Comparte el código con tu oponente para que use 'arena_join_battle'. Una vez que ambos estén conectados, usa 'arena_get_context' para comenzar.`,
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
      description: `Conecta a un contendiente como Contendiente Beta a una sala existente e inicia el debate.
Usar cuando alguien comparte un código de sala y quieres ser el oponente.

Args:
  - battle_id: Código de 4 caracteres de la sala (ej: "A3F9")
  - my_name: Tu nombre en la batalla
  - my_device: Descripción de tu cliente Claude (ej: "Claude Mobile · iOS")

Returns:
  BattleContext con el estado inicial, tu postura asignada e instrucciones para comenzar.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala de 4 caracteres"),
        my_name: z.string().min(2).max(50).describe("Tu nombre en la batalla"),
        my_device: z.string().max(80).default("Claude Web").describe("Cliente Claude que usas"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ battle_id, my_name, my_device }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`, "Verifica el código e intenta de nuevo.");
        if (battle.status !== "waiting") return err(`La batalla #${bid} ya está en curso o finalizada.`);

        // Update beta contender with real name and device (keeping stance set by alpha)
        const betaStance = battle.beta?.stance ?? "";
        addContender(bid, "beta", my_name, betaStance, my_device);

        updateBattleStatus(bid, "active");
        incrementRound(bid);

        const fresh = getBattle(bid)!;
        const context = buildBattleContext(fresh, "beta");

        return ok({
          ...context,
          welcome: `¡Bienvenido a la batalla #${bid}! Eres el Contendiente Beta. Tu postura: "${betaStance}". ${fresh.alpha?.name ?? "Alpha"} argumentará primero.`,
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
      description: `Devuelve el estado completo de la batalla desde tu perspectiva como contendiente.
Úsalo para saber si es tu turno, ver el historial de rondas y los puntajes actuales.
Llámalo al inicio de cada sesión o cuando quieras saber el estado del debate.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")

Returns:
  BattleContext completo con historial, puntajes, turno actual e instrucciones.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side: z.enum(["alpha", "beta"]).describe("Tu lado en la batalla"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ battle_id, my_side }) => {
      try {
        const battle = getBattle(battle_id.toUpperCase());
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
      description: `Envía tu argumento para la ronda actual. Solo disponible cuando es tu turno.
Cuando ambos contendientes han enviado sus argumentos, el árbitro evalúa automáticamente.

IMPORTANTE: Verifica con 'arena_get_context' que sea tu turno antes de llamar esta herramienta.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")
  - argument: Tu argumento (máx 2000 caracteres)

Returns:
  Si eres Alpha: confirmación, espera a Beta.
  Si eres Beta: veredicto del árbitro con puntajes.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side: z.enum(["alpha", "beta"]).describe("Tu lado en la batalla"),
        argument: z.string().min(20).max(2000).describe("Tu argumento para esta ronda"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ battle_id, my_side, argument }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (battle.status !== "active") return err(`La batalla #${bid} no está activa (estado: ${battle.status}).`);

        const round = battle.current_round;
        const roundData = battle.rounds.find(r => r.round_number === round);

        // Validate turn
        if (my_side === "alpha" && roundData?.alpha_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Usa 'arena_get_context' para ver el estado.");
        }
        if (my_side === "beta" && (!roundData || !roundData.alpha_argument)) {
          return err("Alpha aún no ha enviado su argumento.", "Usa 'arena_get_context' para monitorear.");
        }
        if (my_side === "beta" && roundData?.beta_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Espera el veredicto del árbitro.");
        }

        saveArgument(bid, round, my_side, argument);

        // Beta submitted → judge the round
        if (my_side === "beta") {
          updateBattleStatus(bid, "judging");
          const freshBattle = getBattle(bid)!;
          const currentRoundData = freshBattle.rounds.find(r => r.round_number === round)!;

          const judgment = await judgeRound(
            freshBattle, round, currentRoundData.alpha_argument, argument
          );

          saveJudgeVerdict(bid, round, judgment.winner, judgment.verdict, judgment.scores);

          const isLastRound = round >= battle.max_rounds;
          if (isLastRound) {
            const finalBattle = getBattle(bid)!;
            const finalWinner = determineFinalWinner(finalBattle);
            setFinalWinner(bid, finalWinner);

            return ok({
              round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
              battle_finished: true,
              final_winner: finalWinner,
              final_message: `¡Batalla #${bid} finalizada! Ganador: ${finalWinner === "draw" ? "Empate" : finalWinner.toUpperCase()}.`,
            });
          } else {
            updateBattleStatus(bid, "active");
            incrementRound(bid);

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
          message: `Argumento enviado para ronda ${round}. Esperando respuesta de ${battle.beta?.name ?? "Beta"}...`,
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
      description: `Muestra las batallas en curso o esperando contendientes.

Returns:
  Lista de batallas con id, tema, estado y número de espectadores.`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const battles = listActiveBattles();
        return ok({
          count: battles.length,
          battles: battles.map(b => ({
            id: b.id,
            topic: b.topic,
            status: b.status,
            round: `${b.current_round}/${b.max_rounds}`,
            alpha: b.alpha?.name ?? "Esperando...",
            beta: b.beta?.name ?? "Buscando oponente...",
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
      description: `Obtiene el estado completo de una batalla para verla como espectador.
No requiere ser contendiente. Registra tu presencia como espectador.

Args:
  - battle_id: Código de sala a observar

Returns:
  Estado completo: argumentos, puntajes, veredictos del árbitro.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala a observar"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ battle_id }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);

        incrementSpectators(bid);

        return ok({
          battle_id: battle.id,
          topic: battle.topic,
          status: battle.status,
          contenders: {
            alpha: battle.alpha ? { name: battle.alpha.name, stance: battle.alpha.stance } : null,
            beta: battle.beta ? { name: battle.beta.name, stance: battle.beta.stance } : null,
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
