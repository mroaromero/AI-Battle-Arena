// ─── Debate Engine — Phase machine with strict timer enforcement ────────────────

import type { Battle, ContenderSide } from "../types.js";

// ─── Configuration types ───────────────────────────────────────────────────────

export interface DebateConfig {
  mode: "manual" | "random";
  topic: string;
  ejes: string[];                    // 5 sub-questions
  alpha_stance: string;
  beta_stance: string;
  judges: string[];                  // ["anthropic", "openrouter", "groq"]
  methodology: Methodology;
  moderator_enabled: boolean;
  timers: DebateTimers;
  max_ejes: number;                  // default 5
}

export type Methodology = "logica" | "retorica" | "academica";

export interface DebateTimers {
  total_minutes: number;             // default 20
  opening_seconds: number;           // default 30
  cross_seconds: number;             // default 120 (2 min)
  synthesis_seconds: number;         // default 45
  present_seconds: number;           // default 15 (moderator presents)
}

// ─── Phase types ───────────────────────────────────────────────────────────────

export type DebatePhase =
  | "waiting"          // waiting for both contenders
  | "presenting"       // moderator presents the eje (15s)
  | "opening_alpha"    // Alpha's opening (30s)
  | "opening_beta"     // Beta's opening (30s)
  | "cross_alpha"      // Alpha in cross-exchange (2 min)
  | "cross_beta"       // Beta in cross-exchange (2 min)
  | "synthesis"        // moderator synthesizes (45s)
  | "scoring"          // judges evaluate
  | "finished";        // all ejes complete, post-debate analysis

// ─── Phase state ───────────────────────────────────────────────────────────────

export interface DebateState {
  battle_id: string;
  config: DebateConfig;
  current_eje: number;              // 1-based
  current_phase: DebatePhase;
  phase_started_at: string | null;   // ISO timestamp for timer enforcement
  global_started_at: string | null;  // ISO timestamp for total timer
  total_seconds_used: number;
  ejes_completed: number;
  arguments_count: number;           // total arguments submitted this eje
}

// ─── Timer enforcement ─────────────────────────────────────────────────────────

export function getPhaseTimeLimit(phase: DebatePhase, config: DebateConfig): number {
  switch (phase) {
    case "presenting":    return config.timers.present_seconds;
    case "opening_alpha": return config.timers.opening_seconds;
    case "opening_beta":  return config.timers.opening_seconds;
    case "cross_alpha":   return config.timers.cross_seconds;
    case "cross_beta":    return config.timers.cross_seconds;
    case "synthesis":     return config.timers.synthesis_seconds;
    default:              return 0;
  }
}

export function getPhaseTimeRemaining(state: DebateState): number {
  if (!state.phase_started_at) return 0;
  const limit = getPhaseTimeLimit(state.current_phase, state.config);
  if (limit === 0) return 0;
  const elapsed = (Date.now() - new Date(state.phase_started_at).getTime()) / 1000;
  return Math.max(0, limit - Math.floor(elapsed));
}

export function isPhaseExpired(state: DebateState): boolean {
  return getPhaseTimeRemaining(state) <= 0 && state.current_phase !== "waiting" && state.current_phase !== "finished";
}

export function isGlobalTimerExpired(state: DebateState): boolean {
  if (!state.global_started_at) return false;
  const elapsed = (Date.now() - new Date(state.global_started_at).getTime()) / 1000;
  return elapsed >= state.config.timers.total_minutes * 60;
}

// ─── Turn order by round ───────────────────────────────────────────────────────

export function getOpeningOrder(eje: number): [ContenderSide, ContenderSide] {
  // Odd ejes (1,3,5): Alpha first
  // Even ejes (2,4): Beta first
  return eje % 2 === 1 ? ["alpha", "beta"] : ["beta", "alpha"];
}

export function getCrossOrder(eje: number): [ContenderSide, ContenderSide] {
  // Same as opening order for cross-exchange
  return getOpeningOrder(eje);
}

export function getCurrentActiveSide(state: DebateState): ContenderSide | null {
  switch (state.current_phase) {
    case "opening_alpha": return "alpha";
    case "opening_beta":  return "beta";
    case "cross_alpha":   return "alpha";
    case "cross_beta":    return "beta";
    default:              return null;
  }
}

export function canSideSubmit(state: DebateState, side: ContenderSide): { allowed: boolean; reason: string } {
  const activeSide = getCurrentActiveSide(state);
  if (!activeSide) return { allowed: false, reason: "No active phase requiring input" };
  if (activeSide !== side) return { allowed: false, reason: `Es el turno de ${activeSide}` };
  if (isPhaseExpired(state)) return { allowed: false, reason: "Tiempo agotado para esta fase" };
  if (isGlobalTimerExpired(state)) return { allowed: false, reason: "Tiempo global agotado" };
  return { allowed: true, reason: "" };
}

// ─── Phase transitions ─────────────────────────────────────────────────────────

export interface PhaseTransition {
  new_phase: DebatePhase;
  new_eje?: number;
  action: "continue" | "advance_eje" | "finish" | "auto_advance";
  reason: string;
}

export function getNextPhase(state: DebateState, argumentsInPhase: number): PhaseTransition {
  const config = state.config;

  // Global timer check
  if (isGlobalTimerExpired(state)) {
    return { new_phase: "finished", action: "finish", reason: "Tiempo global agotado (20 min)" };
  }

  switch (state.current_phase) {
    case "waiting":
      return { new_phase: "presenting", action: "continue", reason: "Moderador presenta el eje" };

    case "presenting": {
      const [first] = getOpeningOrder(state.current_eje);
      return {
        new_phase: first === "alpha" ? "opening_alpha" : "opening_beta",
        action: "continue",
        reason: `Apertura de ${first}`,
      };
    }

    case "opening_alpha": {
      const [, second] = getOpeningOrder(state.current_eje);
      if (second === "beta") {
        return { new_phase: "opening_beta", action: "continue", reason: "Apertura de Beta" };
      }
      return { new_phase: "cross_alpha", action: "continue", reason: "Cruce libre — Alpha" };
    }

    case "opening_beta": {
      const [, second] = getOpeningOrder(state.current_eje);
      if (second === "alpha") {
        return { new_phase: "opening_alpha", action: "continue", reason: "Apertura de Alpha" };
      }
      return { new_phase: "cross_alpha", action: "continue", reason: "Cruce libre — Alpha" };
    }

    case "cross_alpha":
      return { new_phase: "cross_beta", action: "continue", reason: "Cruce libre — Beta" };

    case "cross_beta":
      if (config.moderator_enabled) {
        return { new_phase: "synthesis", action: "continue", reason: "Síntesis del moderador" };
      }
      return { new_phase: "scoring", action: "continue", reason: "Evaluación de jueces" };

    case "synthesis":
      return { new_phase: "scoring", action: "continue", reason: "Evaluación de jueces" };

    case "scoring": {
      if (state.current_eje >= config.max_ejes) {
        return { new_phase: "finished", action: "finish", reason: "Todos los ejes completados" };
      }
      return {
        new_phase: "presenting",
        action: "advance_eje",
        new_eje: state.current_eje + 1,
        reason: `Siguiente eje (${state.current_eje + 1}/${config.max_ejes})`,
      };
    }

    default:
      return { new_phase: "finished", action: "finish", reason: "Estado desconocido" };
  }
}

// ─── Methodology weights ───────────────────────────────────────────────────────

export interface ScoreWeights {
  coherence: number;
  evidence: number;
  rhetoric: number;
}

export function getMethodologyWeights(methodology: Methodology): ScoreWeights {
  switch (methodology) {
    case "logica":   return { coherence: 0.5, evidence: 0.35, rhetoric: 0.15 };
    case "retorica": return { coherence: 0.2, evidence: 0.25, rhetoric: 0.55 };
    case "academica": return { coherence: 0.3, evidence: 0.5, rhetoric: 0.2 };
  }
}

// ─── Default config ────────────────────────────────────────────────────────────

export function createDefaultConfig(): DebateConfig {
  return {
    mode: "manual",
    topic: "",
    ejes: ["", "", "", "", ""],
    alpha_stance: "",
    beta_stance: "",
    judges: ["anthropic"],
    methodology: "retorica",
    moderator_enabled: true,
    timers: {
      total_minutes: 20,
      opening_seconds: 30,
      cross_seconds: 120,
      synthesis_seconds: 45,
      present_seconds: 15,
    },
    max_ejes: 5,
  };
}

// ─── Phase label for UI ────────────────────────────────────────────────────────

export function phaseLabel(phase: DebatePhase): string {
  switch (phase) {
    case "waiting":        return "ESPERANDO CONTENDIENTES";
    case "presenting":     return "MODERADOR PRESENTA";
    case "opening_alpha":  return "APERTURA ALPHA";
    case "opening_beta":   return "APERTURA BETA";
    case "cross_alpha":    return "CRUCE — ALPHA";
    case "cross_beta":     return "CRUCE — BETA";
    case "synthesis":      return "SÍNTESIS DEL MODERADOR";
    case "scoring":        return "EVALUACIÓN DE JUECES";
    case "finished":       return "DEBATE FINALIZADO";
  }
}
