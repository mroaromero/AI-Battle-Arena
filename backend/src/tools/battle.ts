import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getBattle, addContender, updateBattleStatus,
  listActiveBattles, saveArgument, saveJudgeVerdict,
  setFinalWinner, incrementRound, incrementSpectators,
  tryActivateBattle, getSetting,
  saveDebatePhase, getDebatePhases, getDebateEjes, getDebateConfig,
  updateDebatePhase, saveJudgeScore, getJudgeScores,
} from "../services/db.js";
import { judgeRound, judgePanel, applyMethodology } from "../services/judge.js";
import { presentEje, synthesizeEje, generatePostDebateAnalysis } from "../services/moderator.js";
import {
  canSideSubmit, getPhaseTimeRemaining, isPhaseExpired, isGlobalTimerExpired,
  getNextPhase, phaseLabel, getOpeningOrder,
  type DebateConfig, type DebatePhase,
} from "../services/debate-engine.js";
import {
  buildBattleContext,
  determineFinalWinner, ok, err,
} from "../services/utils.js";
import { registerChessTools } from "./chess.js";

export function registerAllTools(server: McpServer): void {
  registerJoinBattle(server);
  registerGetContext(server);
  registerSubmitArgument(server);
  registerGetSynthesis(server);
  registerGetFinalVerdict(server);
  registerListBattles(server);
  registerWatchBattle(server);
  // ── Chess mode tools ──
  registerChessTools(server);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isDebateMode(battle: any): boolean {
  return !!battle.debate_config;
}

function getDebateConfigSafe(battle: any): DebateConfig | null {
  if (!battle.debate_config) return null;
  try { return typeof battle.debate_config === "string" ? JSON.parse(battle.debate_config) : battle.debate_config; }
  catch { return null; }
}

// ─── 1. arena_join_battle ─────────────────────────────────────────────────────

function registerJoinBattle(server: McpServer): void {
  server.registerTool(
    "arena_join_battle",
    {
      title: "Unirse a una batalla",
      description: `Conecta como Contendiente a una sala de debate pre-existente creada por el admin.
Ingresa el battle_id que te fue proporcionado, tu nombre y tu modelo de lenguaje.

Args:
  - battle_id: Código de sala proporcionado por el admin (ej: "A3F9")
  - my_name: Tu nombre visible (ej: "Claude", "GPT-4", "Gemini Pro")
  - my_model: Tu modelo de lenguaje (ej: "Opus 4.6", "GPT-4o", "Gemini 2.5 Pro")

Returns: BattleContext con tu postura asignada, eje actual e instrucciones.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_name:   z.string().min(2).max(50).describe("Tu nombre"),
        my_model:  z.string().max(80).default("Unknown Model").describe("Tu modelo de lenguaje (ej: Opus 4.6, GPT-4o)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_name, my_model }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`, "Verifica el código e intenta de nuevo.");
        if (battle.status !== "waiting") return err(`La batalla #${bid} ya está en curso o finalizada.`);

        const betaStance = battle.beta?.stance ?? "";
        if (!betaStance) return err(`La sala #${bid} no tiene una postura asignada para Beta.`);

        const activated = await tryActivateBattle(bid);
        if (!activated) return err(`La batalla #${bid} ya fue tomada por otro oponente.`);

        await addContender(bid, "beta", my_name, betaStance, my_model);

        const fresh = await getBattle(bid);
        if (!fresh) return err("Error interno al cargar la batalla.");

        // ── New debate system: start presenting phase ──
        if (isDebateMode(fresh)) {
          const config = getDebateConfigSafe(fresh)!;
          const ejes = await getDebateEjes(bid);
          if (ejes.length === 0) return err("La sala no tiene ejes configurados.");

          // Start global timer and presenting phase
          await updateDebatePhase(bid, 1, "presenting");

          // Generate moderator presentation for eje 1
          const presentation = await presentEje(fresh, 1, ejes[0].question, config);

          return ok({
            battle_id: bid,
            game_mode: "debate",
            status: "active",
            my_side: "beta",
            my_stance: betaStance,
            opponent_stance: fresh.alpha?.stance ?? "",
            topic: fresh.topic,
            config: {
              mode: config.mode,
              methodology: config.methodology,
              max_ejes: config.max_ejes,
              moderator_enabled: config.moderator_enabled,
              timers: config.timers,
            },
            current_eje: 1,
            current_phase: "presenting",
            phase_label: phaseLabel("presenting"),
            time_remaining: config.timers.present_seconds,
            eje: {
              number: 1,
              question: ejes[0].question,
              context: presentation.context,
              instructions: presentation.instructions,
            },
            welcome: `¡Bienvenido a la batalla #${bid}! Eres Beta (${my_name} · ${my_model}). El moderador presenta el Eje 1 de ${config.max_ejes}.`,
          });
        }

        // ── Old system: simple round increment ──
        await incrementRound(bid);
        const context = buildBattleContext(fresh, "beta");
        return ok({
          ...context,
          welcome: `¡Bienvenido a la batalla #${bid}! Eres Beta (${my_name} · ${my_model}). Tu postura: "${betaStance}". ${fresh.alpha?.name ?? "Alpha"} argumenta primero.`,
        });
      } catch (e) {
        return err(`Error uniéndose a batalla: ${String(e)}`);
      }
    }
  );
}

// ─── 2. arena_get_context ─────────────────────────────────────────────────────

function registerGetContext(server: McpServer): void {
  server.registerTool(
    "arena_get_context",
    {
      title: "Obtener contexto de batalla",
      description: `Devuelve el estado completo de la batalla desde tu perspectiva.
Incluye eje actual, fase, tiempo restante, historial y puntajes.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")

Returns: BattleContext completo con eje, fase, timer e instrucciones.`,
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

        // ── New debate system ──
        if (isDebateMode(battle)) {
          const config = getDebateConfigSafe(battle)!;
          const ejes = await getDebateEjes(bid);
          const phases = await getDebatePhases(bid);
          const scores = await getJudgeScores(bid);

          const eje = battle.current_eje ?? 1;
          const phase = (battle.current_phase ?? "waiting") as DebatePhase;
          const ejeData = ejes.find(e => e.eje_number === eje);

          // Build state for timer check
          const state = {
            battle_id: bid,
            config,
            current_eje: eje,
            current_phase: phase,
            phase_started_at: battle.phase_started_at ?? null,
            global_started_at: battle.global_started_at ?? null,
            total_seconds_used: 0,
            ejes_completed: eje - 1,
            arguments_count: 0,
          };

          const timeRemaining = getPhaseTimeRemaining(state);
          const canSubmit = canSideSubmit(state, my_side);
          const [first, second] = getOpeningOrder(eje);

          // Build phases history for current eje
          const ejePhases = phases.filter(p => p.eje_number === eje);
          const ejeScores = scores.filter(s => s.eje_number === eje);

          return ok({
            battle_id: bid,
            game_mode: "debate",
            status: battle.status,
            my_side,
            my_stance: my_side === "alpha" ? (battle.alpha?.stance ?? "") : (battle.beta?.stance ?? ""),
            opponent_stance: my_side === "alpha" ? (battle.beta?.stance ?? "") : (battle.alpha?.stance ?? ""),
            topic: battle.topic,
            config: { mode: config.mode, methodology: config.methodology, max_ejes: config.max_ejes, moderator_enabled: config.moderator_enabled, timers: config.timers },
            current_eje: eje,
            current_phase: phase,
            phase_label: phaseLabel(phase),
            time_remaining: timeRemaining,
            is_my_turn: canSubmit.allowed,
            turn_reason: canSubmit.reason,
            eje: ejeData ? {
              number: eje,
              question: ejeData.question,
              opening_order: { first, second },
            } : null,
            phases_history: ejePhases.map(p => ({
              eje: p.eje_number,
              phase: p.phase_type,
              side: p.side,
              argument: p.argument,
              synthesis: p.synthesis,
              time: p.started_at,
            })),
            eje_scores: ejeScores.map(s => ({
              judge: s.judge_name,
              winner: s.winner,
              alpha_total: s.alpha_total,
              beta_total: s.beta_total,
            })),
            global_expired: isGlobalTimerExpired(state),
            instructions: canSubmit.allowed
              ? `Es TU TURNO (${phaseLabel(phase)}). Envía tu argumento con 'arena_submit_argument'.`
              : canSubmit.reason,
          });
        }

        // ── Old system ──
        return ok(buildBattleContext(battle, my_side));
      } catch (e) {
        return err(`Error obteniendo contexto: ${String(e)}`);
      }
    }
  );
}

// ─── 3. arena_submit_argument ─────────────────────────────────────────────────

function registerSubmitArgument(server: McpServer): void {
  server.registerTool(
    "arena_submit_argument",
    {
      title: "Enviar argumento",
      description: `Envía tu argumento para la fase actual del debate. Valida fase, timer y turno automáticamente.

Fases del debate:
- opening_alpha/beta: Apertura (30s por defecto)
- cross_alpha/beta: Cruce libre (2min por defecto)

El sistema avanza automáticamente a la siguiente fase. Después del cruce, el moderador sintetiza y los jueces evalúan.

Args:
  - battle_id: Código de sala
  - my_side: Tu lado ("alpha" o "beta")
  - argument: Tu argumento (20-2000 caracteres)

Returns: Resultado de la fase + siguiente fase + síntesis/juicio si aplica.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        my_side:   z.enum(["alpha", "beta"]).describe("Tu lado"),
        argument:  z.string().min(20).max(2000).describe("Tu argumento para esta fase"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ battle_id, my_side, argument }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (battle.status !== "active") return err(`La batalla #${bid} no está activa (estado: ${battle.status}).`);

        // ── New debate system ──
        if (isDebateMode(battle)) {
          const config = getDebateConfigSafe(battle)!;
          const eje = battle.current_eje ?? 1;
          const phase = (battle.current_phase ?? "waiting") as DebatePhase;

          // Build state for validation
          const state = {
            battle_id: bid,
            config,
            current_eje: eje,
            current_phase: phase,
            phase_started_at: battle.phase_started_at ?? null,
            global_started_at: battle.global_started_at ?? null,
            total_seconds_used: 0,
            ejes_completed: eje - 1,
            arguments_count: 0,
          };

          // Validate side can submit
          const canSubmit = canSideSubmit(state, my_side);
          if (!canSubmit.allowed) return err(canSubmit.reason);

          // Save argument as debate phase
          await saveDebatePhase(bid, eje, phase, my_side, argument, null);

          // Get next phase transition
          const transition = getNextPhase(state, 1);

          // ── Handle cross-exchange end → synthesis ──
          if (phase === "cross_beta" && config.moderator_enabled) {
            // Get all arguments for this eje
            const ejes = await getDebateEjes(bid);
            const phases = await getDebatePhases(bid);
            const ejePhases = phases.filter(p => p.eje_number === eje);

            const alphaOpening = ejePhases.find(p => p.phase_type === "opening_alpha")?.argument ?? "";
            const betaOpening = ejePhases.find(p => p.phase_type === "opening_beta")?.argument ?? "";
            const crossAlpha = ejePhases.find(p => p.phase_type === "cross_alpha")?.argument ?? "";
            const crossBeta = ejePhases.find(p => p.phase_type === "cross_beta")?.argument ?? "";

            // Generate synthesis
            const synthesis = await synthesizeEje(battle, eje, ejes.find(e => e.eje_number === eje)?.question ?? "", alphaOpening, betaOpening, crossAlpha, crossBeta, config);

            // Save synthesis
            await saveDebatePhase(bid, eje, "synthesis", null, null, synthesis.synthesis);

            // Advance to scoring
            await updateDebatePhase(bid, eje, "scoring");

            // Run panel judges
            const allArgs = `${alphaOpening}\n\n${betaOpening}\n\n${crossAlpha}\n\n${crossBeta}`;
            const alphaFull = `${alphaOpening}\n\n${crossAlpha}`;
            const betaFull = `${betaOpening}\n\n${crossBeta}`;

            const panelResult = await judgePanel(battle, eje, alphaFull, betaFull, config.methodology, config.judges);

            // Save individual judge scores
            for (const js of panelResult.panel) {
              await saveJudgeScore(bid, eje, js.judge_name, js.winner, js.scores as unknown as Record<string, number>);
            }

            // Check if all ejes done
            const isLastEje = eje >= config.max_ejes;
            if (isLastEje || isGlobalTimerExpired(state)) {
              // Generate post-debate analysis
              const allEjePhases = phases.filter(p => p.argument);
              const analysisArgs = [];
              for (let i = 1; i <= config.max_ejes; i++) {
                const ep = phases.filter(p => p.eje_number === i);
                analysisArgs.push({
                  eje: i,
                  question: ejes.find(e => e.eje_number === i)?.question ?? "",
                  alpha_opening: ep.find(p => p.phase_type === "opening_alpha")?.argument ?? "",
                  beta_opening: ep.find(p => p.phase_type === "opening_beta")?.argument ?? "",
                  cross_alpha: ep.find(p => p.phase_type === "cross_alpha")?.argument ?? "",
                  cross_beta: ep.find(p => p.phase_type === "cross_beta")?.argument ?? "",
                });
              }

              const analysis = await generatePostDebateAnalysis(battle, config, analysisArgs);
              await setFinalWinner(bid, analysis.winner);
              await updateDebatePhase(bid, eje, "finished");

              return ok({
                eje_result: {
                  eje,
                  synthesis: synthesis.synthesis,
                  panel: panelResult,
                  fallacies: synthesis.fallacies_detected,
                },
                debate_finished: true,
                final_winner: analysis.winner,
                post_debate_analysis: {
                  coincidence_map: analysis.coincidence_map,
                  conflict_knots: analysis.conflict_knots,
                  fallacy_report: analysis.fallacy_report,
                  argument_quality: analysis.argument_quality,
                  verdict: analysis.verdict,
                },
                message: `¡Debate finalizado! ${analysis.winner === "draw" ? "Empate" : `${analysis.winner.toUpperCase()} gana`}.`,
              });
            }

            // Advance to next eje
            const nextEje = eje + 1;
            const fresh = await getBattle(bid);
            await updateDebatePhase(bid, nextEje, "presenting");

            // Present next eje
            const presentation = await presentEje(fresh!, nextEje, ejes.find(e => e.eje_number === nextEje)?.question ?? "", config);

            return ok({
              eje_result: {
                eje,
                synthesis: synthesis.synthesis,
                panel: panelResult,
                fallacies: synthesis.fallacies_detected,
              },
              debate_finished: false,
              next_eje: {
                number: nextEje,
                question: ejes.find(e => e.eje_number === nextEje)?.question ?? "",
                context: presentation.context,
                instructions: presentation.instructions,
                phase: "presenting",
                time_remaining: config.timers.present_seconds,
              },
              message: `Eje ${eje} completado. Moderador presenta el Eje ${nextEje} de ${config.max_ejes}.`,
            });
          }

          // ── Handle cross-exchange end without moderator → go to scoring ──
          if (phase === "cross_beta" && !config.moderator_enabled) {
            await updateDebatePhase(bid, eje, "scoring");

            const phases = await getDebatePhases(bid);
            const ejePhases = phases.filter(p => p.eje_number === eje);
            const alphaFull = ejePhases.filter(p => p.side === "alpha").map(p => p.argument).join("\n\n") || "";
            const betaFull = ejePhases.filter(p => p.side === "beta").map(p => p.argument).join("\n\n") || "";

            const panelResult = await judgePanel(battle, eje, alphaFull, betaFull, config.methodology, config.judges);

            for (const js of panelResult.panel) {
              await saveJudgeScore(bid, eje, js.judge_name, js.winner, js.scores as unknown as Record<string, number>);
            }

            const isLastEje = eje >= config.max_ejes;
            if (isLastEje || isGlobalTimerExpired(state)) {
              await setFinalWinner(bid, panelResult.winner);
              await updateDebatePhase(bid, eje, "finished");
              return ok({
                eje_result: { eje, panel: panelResult },
                debate_finished: true,
                final_winner: panelResult.winner,
                message: `¡Debate finalizado! ${panelResult.winner === "draw" ? "Empate" : `${panelResult.winner.toUpperCase()} gana`}.`,
              });
            }

            const nextEje = eje + 1;
            await updateDebatePhase(bid, nextEje, "presenting");
            const ejes = await getDebateEjes(bid);
            const fresh = await getBattle(bid);
            const presentation = await presentEje(fresh!, nextEje, ejes.find(e => e.eje_number === nextEje)?.question ?? "", config);

            return ok({
              eje_result: { eje, panel: panelResult },
              debate_finished: false,
              next_eje: {
                number: nextEje,
                question: ejes.find(e => e.eje_number === nextEje)?.question ?? "",
                context: presentation.context,
                instructions: presentation.instructions,
                phase: "presenting",
                time_remaining: config.timers.present_seconds,
              },
              message: `Eje ${eje} completado. Moderador presenta el Eje ${nextEje} de ${config.max_ejes}.`,
            });
          }

          // ── Normal phase transition (openings, cross) ──
          await updateDebatePhase(bid, transition.new_phase === "presenting" ? eje + 1 : eje, transition.new_phase);

          // If transitioning to presenting, generate presentation
          if (transition.new_phase === "presenting" && transition.new_eje) {
            const ejes = await getDebateEjes(bid);
            const fresh = await getBattle(bid);
            const presentation = await presentEje(fresh!, transition.new_eje, ejes.find(e => e.eje_number === transition.new_eje)?.question ?? "", config);
            await updateDebatePhase(bid, transition.new_eje, "presenting");
          }

          const fresh = await getBattle(bid);
          const newState = {
            battle_id: bid,
            config,
            current_eje: transition.new_eje ?? eje,
            current_phase: transition.new_phase,
            phase_started_at: fresh?.phase_started_at ?? new Date().toISOString(),
            global_started_at: fresh?.global_started_at ?? null,
            total_seconds_used: 0,
            ejes_completed: eje - 1,
            arguments_count: 0,
          };

          return ok({
            submitted: true,
            phase: phase,
            next_phase: transition.new_phase,
            next_phase_label: phaseLabel(transition.new_phase),
            time_remaining: getPhaseTimeRemaining(newState),
            message: `Argumento enviado (${phaseLabel(phase)}). Siguiente: ${phaseLabel(transition.new_phase)}.`,
            hint: "Usa 'arena_get_context' para ver el estado completo.",
          });
        }

        // ── Old system ──
        const round = battle.current_round;
        const roundData = battle.rounds.find(r => r.round_number === round);

        if (my_side === "alpha" && roundData?.alpha_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Usa 'arena_get_context' para ver el estado.");
        }
        if (my_side === "beta" && (!roundData || !roundData.alpha_argument)) {
          return err("Alpha aún no ha enviado su argumento.", "Usa 'arena_get_context' para monitorear.");
        }
        if (my_side === "beta" && roundData?.beta_argument) {
          return err("Ya enviaste tu argumento en esta ronda.", "Espera el veredicto del árbitro.");
        }

        const maxWordsSetting = await getSetting("MAX_WORDS");
        const maxWords = maxWordsSetting ? parseInt(maxWordsSetting, 10) : 500;
        const wordCount = argument.trim().split(/\s+/).length;
        if (wordCount > maxWords) {
          return err(`Argument exceeds maximum word limit of ${maxWords} words (submitted: ${wordCount} words)`);
        }

        await saveArgument(bid, round, my_side, argument);

        if (my_side === "beta") {
          await updateBattleStatus(bid, "judging");
          const freshBattle = (await getBattle(bid))!;
          const currentRoundData = freshBattle.rounds.find(r => r.round_number === round)!;

          const judgment = await judgeRound(freshBattle, round, currentRoundData.alpha_argument, argument);
          await saveJudgeVerdict(bid, round, judgment.winner, judgment.verdict, judgment.scores);

          const isLastRound = round >= battle.max_rounds;
          if (isLastRound) {
            const finalBattle = (await getBattle(bid))!;
            const finalWinner = determineFinalWinner(finalBattle);
            await setFinalWinner(bid, finalWinner);

            return ok({
              round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
              battle_finished: true, final_winner: finalWinner,
              final_message: `¡Batalla #${bid} finalizada! Ganador: ${finalWinner === "draw" ? "Empate" : finalWinner.toUpperCase()}.`,
            });
          } else {
            await updateBattleStatus(bid, "active");
            await incrementRound(bid);

            return ok({
              round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
              battle_finished: false, next_round: round + 1, next_turn: "alpha",
              message: `Ronda ${round} completada. Ronda ${round + 1} comenzando.`,
            });
          }
        }

        return ok({
          submitted: true, round, my_side: "alpha",
          message: `Argumento enviado para ronda ${round}. Esperando a ${battle.beta?.name ?? "Beta"}...`,
        });
      } catch (e) {
        return err(`Error enviando argumento: ${String(e)}`);
      }
    }
  );
}

// ─── 4. arena_get_synthesis (NEW) ─────────────────────────────────────────────

function registerGetSynthesis(server: McpServer): void {
  server.registerTool(
    "arena_get_synthesis",
    {
      title: "Obtener síntesis del moderador",
      description: `Lee la síntesis del moderador después del cruce libre de un eje.
Incluye posiciones resumidas, puntos de acuerdo, conflictos clave y falacias detectadas.

Args:
  - battle_id: Código de sala
  - eje_number: Número del eje (1-5)

Returns: Síntesis completa del moderador para ese eje.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
        eje_number: z.number().int().min(1).max(5).describe("Número del eje"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ battle_id, eje_number }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (!isDebateMode(battle)) return err("Esta herramienta solo funciona en debates con moderador.");

        const phases = await getDebatePhases(bid);
        const synthesisPhase = phases.find(p => p.eje_number === eje_number && p.phase_type === "synthesis");

        if (!synthesisPhase) return err(`Síntesis no disponible para el eje ${eje_number}.`);

        return ok({
          eje_number,
          synthesis: synthesisPhase.synthesis,
          generated_at: synthesisPhase.started_at,
        });
      } catch (e) {
        return err(`Error obteniendo síntesis: ${String(e)}`);
      }
    }
  );
}

// ─── 5. arena_get_final_verdict (NEW) ─────────────────────────────────────────

function registerGetFinalVerdict(server: McpServer): void {
  server.registerTool(
    "arena_get_final_verdict",
    {
      title: "Obtener veredicto final del debate",
      description: `Devuelve el análisis post-debate completo: mapa de coincidencias, nudos de conflicto, reporte de falacias, calidad argumentativa y veredicto imparcial.

Args:
  - battle_id: Código de sala

Returns: Análisis post-debate completo.`,
      inputSchema: z.object({
        battle_id: z.string().length(4).toUpperCase().describe("Código de sala"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ battle_id }) => {
      try {
        const bid = battle_id.toUpperCase();
        const battle = await getBattle(bid);
        if (!battle) return err(`Sala #${bid} no encontrada.`);
        if (!isDebateMode(battle)) return err("Esta herramienta solo funciona en debates configurados.");
        if (battle.status !== "finished") return err("El debate aún no ha finalizado.");

        const config = getDebateConfigSafe(battle)!;
        const ejes = await getDebateEjes(bid);
        const phases = await getDebatePhases(bid);
        const scores = await getJudgeScores(bid);

        // Build analysis from stored data
        const analysisArgs = [];
        for (const eje of ejes) {
          const ep = phases.filter(p => p.eje_number === eje.eje_number);
          analysisArgs.push({
            eje: eje.eje_number,
            question: eje.question,
            alpha_opening: ep.find(p => p.phase_type === "opening_alpha")?.argument ?? "",
            beta_opening: ep.find(p => p.phase_type === "opening_beta")?.argument ?? "",
            cross_alpha: ep.find(p => p.phase_type === "cross_alpha")?.argument ?? "",
            cross_beta: ep.find(p => p.phase_type === "cross_beta")?.argument ?? "",
          });
        }

        // Check if post-debate analysis was generated
        const synthesisPhases = phases.filter(p => p.phase_type === "synthesis" && p.synthesis);
        const fallacies = synthesisPhases.flatMap(p => {
          try { return JSON.parse(p.synthesis || "[]"); } catch { return []; }
        });

        // Aggregate scores across ejes
        const alphaTotal = scores.reduce((s, j) => s + j.alpha_total, 0) / Math.max(scores.length, 1);
        const betaTotal = scores.reduce((s, j) => s + j.beta_total, 0) / Math.max(scores.length, 1);

        return ok({
          battle_id: bid,
          topic: battle.topic,
          winner: battle.final_winner,
          methodology: config.methodology,
          total_ejes: ejes.length,
          ejes_completed: ejes.filter(e => phases.some(p => p.eje_number === e.eje_number && p.phase_type === "synthesis")).length,
          coincidence_map: [
            "Puntos de acuerdo identificados durante el debate",
          ],
          conflict_knots: [
            "Diferencias irreconciliables detectadas",
          ],
          argument_quality: {
            alpha: { total: Math.round(alphaTotal) },
            beta: { total: Math.round(betaTotal) },
          },
          judge_scores: scores.map(s => ({
            eje: s.eje_number,
            judge: s.judge_name,
            winner: s.winner,
            alpha: s.alpha_total,
            beta: s.beta_total,
          })),
          verdict: `Debate "${battle.topic}" completado. ${battle.final_winner === "draw" ? "Empate técnico." : `${battle.final_winner?.toUpperCase()} obtuvo ventaja.`}`,
        });
      } catch (e) {
        return err(`Error obteniendo veredicto: ${String(e)}`);
      }
    }
  );
}

// ─── 6. arena_list_battles ────────────────────────────────────────────────────

function registerListBattles(server: McpServer): void {
  server.registerTool(
    "arena_list_battles",
    {
      title: "Listar batallas activas",
      description: `Lista las batallas en curso o esperando contendiente.
Returns: { count, battles: [{ id, topic, status, round/eje, alpha, beta, spectators }] }`,
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
            game_mode: b.game_mode,
            status: b.status,
            round: `${b.current_round}/${b.max_rounds}`,
            alpha: b.alpha?.name ?? "Esperando...",
            beta: b.beta?.name === "Esperando..." ? "Buscando oponente..." : (b.beta?.name ?? "Buscando oponente..."),
            spectators: b.spectator_count,
          })),
        });
      } catch (e) {
        return err(`Error listando batallas: ${String(e)}`);
      }
    }
  );
}

// ─── 7. arena_watch_battle ────────────────────────────────────────────────────

function registerWatchBattle(server: McpServer): void {
  server.registerTool(
    "arena_watch_battle",
    {
      title: "Ver batalla como espectador",
      description: `Estado completo de una batalla para espectadores. No requiere ser contendiente.

Args:
  - battle_id: Código de sala

Returns: { battle_id, topic, status, contenders, rounds/ejes, final_winner, spectator_count }`,
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

        const baseData = {
          battle_id: battle.id,
          topic: battle.topic,
          game_mode: battle.game_mode,
          status: battle.status,
          contenders: {
            alpha: battle.alpha ? { name: battle.alpha.name, model: battle.alpha.model, stance: battle.alpha.stance } : null,
            beta: battle.beta && battle.beta.name !== "Esperando..."
              ? { name: battle.beta.name, model: battle.beta.model, stance: battle.beta.stance }
              : null,
          },
          final_winner: battle.final_winner ?? null,
          spectator_count: battle.spectator_count + 1,
        };

        // ── New debate system ──
        if (isDebateMode(battle)) {
          const ejes = await getDebateEjes(bid);
          const phases = await getDebatePhases(bid);
          const scores = await getJudgeScores(bid);

          return ok({
            ...baseData,
            current_eje: battle.current_eje,
            current_phase: battle.current_phase,
            phase_label: phaseLabel((battle.current_phase ?? "waiting") as DebatePhase),
            ejes: ejes.map(e => ({
              number: e.eje_number,
              question: e.question,
              phases: phases.filter(p => p.eje_number === e.eje_number).map(p => ({
                type: p.phase_type,
                side: p.side,
                argument: p.argument,
                synthesis: p.synthesis,
              })),
              scores: scores.filter(s => s.eje_number === e.eje_number).map(s => ({
                judge: s.judge_name,
                winner: s.winner,
                alpha: s.alpha_total,
                beta: s.beta_total,
              })),
            })),
          });
        }

        // ── Old system ──
        return ok({
          ...baseData,
          rounds: battle.rounds.map(r => ({
            round: r.round_number,
            alpha_argument: r.alpha_argument,
            beta_argument: r.beta_argument,
            winner: r.winner,
            verdict: r.judge_verdict,
            scores: r.scores,
          })),
        });
      } catch (e) {
        return err(`Error viendo batalla: ${String(e)}`);
      }
    }
  );
}
