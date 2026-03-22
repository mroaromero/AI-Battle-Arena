import { describe, it, expect } from "vitest";
import {
  getPhaseTimeLimit, getPhaseTimeRemaining, isPhaseExpired,
  getOpeningOrder, getCurrentActiveSide, canSideSubmit,
  getNextPhase, getMethodologyWeights, createDefaultConfig,
  phaseLabel,
  type DebateState, type DebateConfig, type DebatePhase,
} from "../services/debate-engine.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DebateState> = {}): DebateState {
  const config = createDefaultConfig();
  return {
    battle_id: "TEST",
    config,
    current_eje: 1,
    current_phase: "waiting",
    phase_started_at: null,
    global_started_at: null,
    total_seconds_used: 0,
    ejes_completed: 0,
    arguments_count: 0,
    ...overrides,
  };
}

// ─── Timer enforcement ─────────────────────────────────────────────────────────

describe("debate-engine: timer enforcement", () => {
  it("should return correct time limits for each phase", () => {
    const config = createDefaultConfig();
    expect(getPhaseTimeLimit("presenting", config)).toBe(15);
    expect(getPhaseTimeLimit("opening_alpha", config)).toBe(30);
    expect(getPhaseTimeLimit("opening_beta", config)).toBe(30);
    expect(getPhaseTimeLimit("cross_alpha", config)).toBe(120);
    expect(getPhaseTimeLimit("cross_beta", config)).toBe(120);
    expect(getPhaseTimeLimit("synthesis", config)).toBe(45);
    expect(getPhaseTimeLimit("scoring", config)).toBe(0);
    expect(getPhaseTimeLimit("waiting", config)).toBe(0);
    expect(getPhaseTimeLimit("finished", config)).toBe(0);
  });

  it("should return 0 time remaining for waiting phase", () => {
    const state = makeState({ current_phase: "waiting" });
    expect(getPhaseTimeRemaining(state)).toBe(0);
  });

  it("should return 0 time remaining when phase_started_at is null", () => {
    const state = makeState({ current_phase: "opening_alpha", phase_started_at: null });
    expect(getPhaseTimeRemaining(state)).toBe(0);
  });

  it("should return remaining time for active phase", () => {
    const now = new Date().toISOString();
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: now,
    });
    const remaining = getPhaseTimeRemaining(state);
    expect(remaining).toBeGreaterThan(25);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it("should return 0 when phase time expired", () => {
    const expired = new Date(Date.now() - 35000).toISOString(); // 35 seconds ago
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: expired,
    });
    expect(isPhaseExpired(state)).toBe(true);
  });

  it("should not expire when phase time has not passed", () => {
    const recent = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: recent,
    });
    expect(isPhaseExpired(state)).toBe(false);
  });

  it("should not consider waiting phase as expired", () => {
    const state = makeState({ current_phase: "waiting", phase_started_at: null });
    expect(isPhaseExpired(state)).toBe(false);
  });
});

// ─── Turn order ────────────────────────────────────────────────────────────────

describe("debate-engine: turn order", () => {
  it("should give alpha first on odd ejes", () => {
    expect(getOpeningOrder(1)).toEqual(["alpha", "beta"]);
    expect(getOpeningOrder(3)).toEqual(["alpha", "beta"]);
    expect(getOpeningOrder(5)).toEqual(["alpha", "beta"]);
  });

  it("should give beta first on even ejes", () => {
    expect(getOpeningOrder(2)).toEqual(["beta", "alpha"]);
    expect(getOpeningOrder(4)).toEqual(["beta", "alpha"]);
  });

  it("should return correct active side for each phase", () => {
    expect(getCurrentActiveSide(makeState({ current_phase: "opening_alpha" }))).toBe("alpha");
    expect(getCurrentActiveSide(makeState({ current_phase: "opening_beta" }))).toBe("beta");
    expect(getCurrentActiveSide(makeState({ current_phase: "cross_alpha" }))).toBe("alpha");
    expect(getCurrentActiveSide(makeState({ current_phase: "cross_beta" }))).toBe("beta");
    expect(getCurrentActiveSide(makeState({ current_phase: "presenting" }))).toBe(null);
    expect(getCurrentActiveSide(makeState({ current_phase: "synthesis" }))).toBe(null);
    expect(getCurrentActiveSide(makeState({ current_phase: "waiting" }))).toBe(null);
  });
});

// ─── Can submit ────────────────────────────────────────────────────────────────

describe("debate-engine: can side submit", () => {
  it("should allow alpha to submit during opening_alpha", () => {
    const now = new Date().toISOString();
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: now,
      global_started_at: now,
    });
    const result = canSideSubmit(state, "alpha");
    expect(result.allowed).toBe(true);
  });

  it("should not allow beta to submit during opening_alpha", () => {
    const now = new Date().toISOString();
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: now,
      global_started_at: now,
    });
    const result = canSideSubmit(state, "beta");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("alpha");
  });

  it("should not allow submission when phase has expired", () => {
    const expired = new Date(Date.now() - 60000).toISOString();
    const state = makeState({
      current_phase: "opening_alpha",
      phase_started_at: expired,
      global_started_at: expired,
    });
    const result = canSideSubmit(state, "alpha");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("agotado");
  });

  it("should not allow submission when waiting", () => {
    const state = makeState({ current_phase: "waiting" });
    const result = canSideSubmit(state, "alpha");
    expect(result.allowed).toBe(false);
  });
});

// ─── Phase transitions ─────────────────────────────────────────────────────────

describe("debate-engine: phase transitions", () => {
  it("should transition from waiting to presenting", () => {
    const state = makeState({ current_phase: "waiting" });
    const transition = getNextPhase(state, 0);
    expect(transition.new_phase).toBe("presenting");
    expect(transition.action).toBe("continue");
  });

  it("should transition from presenting to opening (odd eje = alpha first)", () => {
    const state = makeState({ current_phase: "presenting", current_eje: 1 });
    const transition = getNextPhase(state, 0);
    expect(transition.new_phase).toBe("opening_alpha");
  });

  it("should transition from presenting to opening (even eje = beta first)", () => {
    const state = makeState({ current_phase: "presenting", current_eje: 2 });
    const transition = getNextPhase(state, 0);
    expect(transition.new_phase).toBe("opening_beta");
  });

  it("should transition from opening_alpha to opening_beta", () => {
    const state = makeState({ current_phase: "opening_alpha", current_eje: 1 });
    const transition = getNextPhase(state, 1);
    expect(transition.new_phase).toBe("opening_beta");
  });

  it("should transition from opening_beta to cross_alpha", () => {
    const state = makeState({ current_phase: "opening_beta", current_eje: 1 });
    const transition = getNextPhase(state, 1);
    expect(transition.new_phase).toBe("cross_alpha");
  });

  it("should transition from cross_alpha to cross_beta", () => {
    const state = makeState({ current_phase: "cross_alpha" });
    const transition = getNextPhase(state, 1);
    expect(transition.new_phase).toBe("cross_beta");
  });

  it("should transition from cross_beta to synthesis when moderator enabled", () => {
    const config = createDefaultConfig();
    config.moderator_enabled = true;
    const state = makeState({ current_phase: "cross_beta", config });
    const transition = getNextPhase(state, 1);
    expect(transition.new_phase).toBe("synthesis");
  });

  it("should transition from cross_beta to scoring when moderator disabled", () => {
    const config = createDefaultConfig();
    config.moderator_enabled = false;
    const state = makeState({ current_phase: "cross_beta", config });
    const transition = getNextPhase(state, 1);
    expect(transition.new_phase).toBe("scoring");
  });

  it("should advance to next eje after scoring (not last eje)", () => {
    const config = createDefaultConfig();
    config.max_ejes = 5;
    const state = makeState({ current_phase: "scoring", current_eje: 3, config });
    const transition = getNextPhase(state, 1);
    expect(transition.action).toBe("advance_eje");
    expect(transition.new_eje).toBe(4);
    expect(transition.new_phase).toBe("presenting");
  });

  it("should finish after scoring on last eje", () => {
    const config = createDefaultConfig();
    config.max_ejes = 5;
    const state = makeState({ current_phase: "scoring", current_eje: 5, config });
    const transition = getNextPhase(state, 1);
    expect(transition.action).toBe("finish");
    expect(transition.new_phase).toBe("finished");
  });
});

// ─── Methodology weights ──────────────────────────────────────────────────────

describe("debate-engine: methodology weights", () => {
  it("should prioritize coherence in logic mode", () => {
    const w = getMethodologyWeights("logica");
    expect(w.coherence).toBeGreaterThan(w.evidence);
    expect(w.coherence).toBeGreaterThan(w.rhetoric);
    expect(w.coherence + w.evidence + w.rhetoric).toBeCloseTo(1.0);
  });

  it("should prioritize rhetoric in rhetoric mode", () => {
    const w = getMethodologyWeights("retorica");
    expect(w.rhetoric).toBeGreaterThan(w.coherence);
    expect(w.rhetoric).toBeGreaterThan(w.evidence);
    expect(w.coherence + w.evidence + w.rhetoric).toBeCloseTo(1.0);
  });

  it("should prioritize evidence in academic mode", () => {
    const w = getMethodologyWeights("academica");
    expect(w.evidence).toBeGreaterThan(w.coherence);
    expect(w.evidence).toBeGreaterThan(w.rhetoric);
    expect(w.coherence + w.evidence + w.rhetoric).toBeCloseTo(1.0);
  });
});

// ─── Phase label ───────────────────────────────────────────────────────────────

describe("debate-engine: phase labels", () => {
  it("should return correct Spanish labels", () => {
    expect(phaseLabel("waiting")).toContain("ESPERANDO");
    expect(phaseLabel("presenting")).toContain("MODERADOR");
    expect(phaseLabel("opening_alpha")).toContain("APERTURA");
    expect(phaseLabel("cross_alpha")).toContain("CRUCE");
    expect(phaseLabel("synthesis")).toContain("SÍNTESIS");
    expect(phaseLabel("scoring")).toContain("EVALUACIÓN");
    expect(phaseLabel("finished")).toContain("FINALIZADO");
  });
});

// ─── Default config ────────────────────────────────────────────────────────────

describe("debate-engine: default config", () => {
  it("should create sensible defaults", () => {
    const config = createDefaultConfig();
    expect(config.mode).toBe("manual");
    expect(config.max_ejes).toBe(5);
    expect(config.moderator_enabled).toBe(true);
    expect(config.timers.total_minutes).toBe(20);
    expect(config.timers.opening_seconds).toBe(30);
    expect(config.timers.cross_seconds).toBe(120);
    expect(config.timers.synthesis_seconds).toBe(45);
    expect(config.judges).toContain("anthropic");
    expect(config.methodology).toBe("retorica");
    expect(config.ejes).toHaveLength(5);
  });
});
