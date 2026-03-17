import { customAlphabet } from "nanoid";
import type { Battle, BattleContext, ContenderSide } from "../types.js";

// ─── ID generation ────────────────────────────────────────────────────────────

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 4);

export function generateBattleId(): string {
  return nanoid();
}

// ─── Battle context builder ───────────────────────────────────────────────────

export function buildBattleContext(battle: Battle, side: ContenderSide): BattleContext {
  const me = side === "alpha" ? battle.alpha : battle.beta;
  const opp = side === "alpha" ? battle.beta : battle.alpha;

  const totalAlpha = battle.rounds.reduce((s, r) => s + (r.scores?.alpha_total ?? 0), 0);
  const totalBeta  = battle.rounds.reduce((s, r) => s + (r.scores?.beta_total ?? 0), 0);

  const currentRound = battle.rounds.find(r => r.round_number === battle.current_round);
  let isMyTurn = false;
  if (battle.status === "active") {
    if (side === "alpha") {
      isMyTurn = !currentRound || currentRound.alpha_argument === "";
    } else {
      isMyTurn = !!currentRound && currentRound.alpha_argument !== "" && currentRound.beta_argument === "";
    }
  }

  const history = battle.rounds
    .filter(r => r.completed_at)
    .map(r => ({
      round: r.round_number,
      my_argument: side === "alpha" ? r.alpha_argument : r.beta_argument,
      opponent_argument: side === "alpha" ? r.beta_argument : r.alpha_argument,
      winner: r.winner,
      judge_verdict: r.judge_verdict,
    }));

  const instructions = isMyTurn
    ? `Es TU TURNO (ronda ${battle.current_round}). Usa 'arena_submit_argument' para enviar tu argumento. Sé conciso pero contundente. Máximo 3 párrafos. Responde al argumento anterior de tu oponente si existe.`
    : `NO es tu turno aún. Espera a que ${opp?.name ?? "tu oponente"} responda. Usa 'arena_get_context' para verificar el estado.`;

  return {
    battle_id: battle.id,
    topic: battle.topic,
    status: battle.status,
    my_side: side,
    my_stance: me?.stance ?? "",
    opponent_stance: opp?.stance ?? "",
    current_round: battle.current_round,
    max_rounds: battle.max_rounds,
    rounds_history: history,
    current_scores: {
      my_total: side === "alpha" ? totalAlpha : totalBeta,
      opponent_total: side === "alpha" ? totalBeta : totalAlpha,
    },
    is_my_turn: isMyTurn,
    instructions,
  };
}

// ─── Score aggregation ────────────────────────────────────────────────────────

export function computeCumulativeScores(battle: Battle): { alpha: number; beta: number } {
  return battle.rounds.reduce(
    (acc, r) => ({
      alpha: acc.alpha + (r.scores?.alpha_total ?? 0),
      beta: acc.beta + (r.scores?.beta_total ?? 0),
    }),
    { alpha: 0, beta: 0 }
  );
}

export function determineFinalWinner(battle: Battle): "alpha" | "beta" | "draw" {
  const { alpha, beta } = computeCumulativeScores(battle);
  if (alpha > beta) return "alpha";
  if (beta > alpha) return "beta";
  return "draw";
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function ok<T>(data: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data }, null, 2) }] };
}

export function err(error: string, hint?: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error, hint }, null, 2) }] };
}
