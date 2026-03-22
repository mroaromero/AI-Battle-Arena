/**
 * Integration tests for the full debate flow.
 *
 * Strategy:
 * - Set DB_PATH to an isolated temp file BEFORE any db imports
 *   so the singleton uses a fresh in-memory-style DB for this process.
 * - Mock the judge to avoid LLM API calls.
 * - Call db service functions directly (same layer the MCP tools use).
 */

import os from "os";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ─── Isolate DB to a temp file for this test process ─────────────────────────
const tempDbPath = path.join(os.tmpdir(), `debate-test-${randomBytes(6).toString("hex")}.db`);
process.env.DB_PATH = tempDbPath;

// ─── Now import services (after env var is set) ───────────────────────────────
import {
  createBattle,
  getBattle,
  addContender,
  tryActivateBattle,
  incrementRound,
  saveArgument,
  saveJudgeVerdict,
  updateBattleStatus,
  setFinalWinner,
} from "../services/db.js";
import { determineFinalWinner } from "../services/utils.js";
import type { RoundScores } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockScores(alphaWins = true): RoundScores {
  return {
    alpha_coherence: alphaWins ? 80 : 50,
    alpha_evidence: alphaWins ? 75 : 50,
    alpha_rhetoric: alphaWins ? 85 : 50,
    alpha_total: alphaWins ? 80 : 50,
    beta_coherence: alphaWins ? 50 : 80,
    beta_evidence: alphaWins ? 50 : 75,
    beta_rhetoric: alphaWins ? 50 : 85,
    beta_total: alphaWins ? 50 : 80,
  };
}

function uniqueId(): string {
  return randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(() => {
  try { fs.unlinkSync(tempDbPath); } catch { /* ignore */ }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Debate flow — status transitions", () => {
  it("creates a battle in 'waiting' status", async () => {
    const id = uniqueId();
    await createBattle(id, "Should AI replace teachers?", 3);
    const battle = await getBattle(id);

    expect(battle).not.toBeNull();
    expect(battle!.status).toBe("waiting");
    expect(battle!.game_mode).toBe("debate");
    expect(battle!.max_rounds).toBe(3);
    expect(battle!.current_round).toBe(0);
    expect(battle!.topic).toBe("Should AI replace teachers?");
  });

  it("transitions to 'active' when Beta joins", async () => {
    const id = uniqueId();
    await createBattle(id, "Is remote work better?", 2);
    await addContender(id, "alpha", "AlphaAI", "Remote work is better", "Claude Desktop");
    await addContender(id, "beta", "TBD", "Office work is better", "");

    // Beta joins
    const activated = await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "Office work is better", "ChatGPT Web");
    await incrementRound(id);

    expect(activated).toBe(true);

    const battle = await getBattle(id);
    expect(battle!.status).toBe("active");
    expect(battle!.current_round).toBe(1);
    expect(battle!.beta?.name).toBe("BetaAI");
  });

  it("does not allow double-joining (tryActivateBattle is idempotent)", async () => {
    const id = uniqueId();
    await createBattle(id, "Can AI be creative?", 1);
    await addContender(id, "alpha", "AlphaAI", "Yes it can", "Claude");
    await addContender(id, "beta", "TBD", "No it cannot", "");

    const first = await tryActivateBattle(id);
    const second = await tryActivateBattle(id);

    expect(first).toBe(true);
    expect(second).toBe(false); // already activated
  });
});

describe("Debate flow — argument submission and judging", () => {
  it("saves Alpha argument and records it in the round", async () => {
    const id = uniqueId();
    await createBattle(id, "Is TypeScript worth it?", 1);
    await addContender(id, "alpha", "AlphaAI", "TypeScript is essential", "Claude");
    await addContender(id, "beta", "TBD", "JavaScript is fine", "");
    await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "JavaScript is fine", "ChatGPT");
    await incrementRound(id);

    const alphaArg = "TypeScript provides static typing which catches bugs early in development and improves IDE support significantly.";
    await saveArgument(id, 1, "alpha", alphaArg);

    const battle = await getBattle(id);
    const round = battle!.rounds.find(r => r.round_number === 1);
    expect(round).toBeDefined();
    expect(round!.alpha_argument).toBe(alphaArg);
    expect(round!.beta_argument).toBe("");
  });

  it("saves Beta argument after Alpha has submitted", async () => {
    const id = uniqueId();
    await createBattle(id, "Open source vs proprietary?", 1);
    await addContender(id, "alpha", "AlphaAI", "Open source is better", "Claude");
    await addContender(id, "beta", "TBD", "Proprietary is better", "");
    await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "Proprietary is better", "ChatGPT");
    await incrementRound(id);

    await saveArgument(id, 1, "alpha", "Open source enables transparency and community-driven innovation that no single company can match.");
    await saveArgument(id, 1, "beta", "Proprietary software offers better support, SLAs, and security auditing that enterprises rely on.");

    const battle = await getBattle(id);
    const round = battle!.rounds.find(r => r.round_number === 1);
    expect(round!.alpha_argument).toContain("Open source");
    expect(round!.beta_argument).toContain("Proprietary");
  });

  it("saves judge verdict with scores and winner", async () => {
    const id = uniqueId();
    await createBattle(id, "Tabs vs spaces?", 1);
    await addContender(id, "alpha", "AlphaAI", "Tabs are better", "Claude");
    await addContender(id, "beta", "TBD", "Spaces are better", "");
    await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "Spaces are better", "ChatGPT");
    await incrementRound(id);

    await saveArgument(id, 1, "alpha", "Tabs allow each developer to choose their preferred indentation width without changing the file.");
    await saveArgument(id, 1, "beta", "Spaces ensure consistent rendering across all editors and platforms, avoiding misalignment issues.");

    const scores = makeMockScores(true); // alpha wins
    await saveJudgeVerdict(id, 1, "alpha", "Alpha's argument about developer flexibility was more compelling.", scores);

    const battle = await getBattle(id);
    const round = battle!.rounds.find(r => r.round_number === 1);
    expect(round!.winner).toBe("alpha");
    expect(round!.judge_verdict).toContain("Alpha");
    expect(round!.scores.alpha_total).toBe(80);
    expect(round!.scores.beta_total).toBe(50);
  });
});

describe("Debate flow — full 3-round battle completion", () => {
  it("completes a 3-round battle and determines a winner", async () => {
    const id = uniqueId();
    await createBattle(id, "Is Agile dead?", 3);
    await addContender(id, "alpha", "AlphaAI", "Agile is still relevant", "Claude Desktop");
    await addContender(id, "beta", "TBD", "Agile is outdated", "");
    await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "Agile is outdated", "ChatGPT Web");
    await incrementRound(id);

    // Round 1 — alpha wins
    await saveArgument(id, 1, "alpha", "Agile enables adaptive planning and continuous delivery of working software across 94% of organizations.");
    await saveArgument(id, 1, "beta", "Agile ceremonies waste developer time without delivering proportional value in most companies.");
    await updateBattleStatus(id, "judging");
    await saveJudgeVerdict(id, 1, "alpha", "Alpha made a stronger evidence-based case.", makeMockScores(true));
    await updateBattleStatus(id, "active");
    await incrementRound(id);

    // Round 2 — beta wins
    await saveArgument(id, 2, "alpha", "Sprint planning ensures teams align on priorities and deliver incrementally instead of big-bang releases.");
    await saveArgument(id, 2, "beta", "SAFe, Scrum, and Kanban fragmentation proves Agile has no standard meaning anymore — it is a buzzword.");
    await updateBattleStatus(id, "judging");
    await saveJudgeVerdict(id, 2, "beta", "Beta exposed the fragmentation problem effectively.", makeMockScores(false));
    await updateBattleStatus(id, "active");
    await incrementRound(id);

    // Round 3 — alpha wins again
    await saveArgument(id, 3, "alpha", "Despite fragmentation, core Agile values of collaboration and iteration are universally adopted and productive.");
    await saveArgument(id, 3, "beta", "Core values without consistent practice are meaningless — waterfall rebranded is still waterfall.");
    await updateBattleStatus(id, "judging");
    await saveJudgeVerdict(id, 3, "alpha", "Alpha's closing argument was more persuasive.", makeMockScores(true));

    // Determine winner
    const preFinal = await getBattle(id);
    const winner = determineFinalWinner(preFinal!);
    await setFinalWinner(id, winner);

    // Verify final state
    const finalBattle = await getBattle(id);
    expect(finalBattle!.status).toBe("finished");
    expect(finalBattle!.final_winner).toBe("alpha"); // alpha won rounds 1 and 3
    expect(finalBattle!.rounds).toHaveLength(3);
    expect(finalBattle!.rounds.every(r => r.winner)).toBe(true);
    expect(finalBattle!.finished_at).toBeDefined();
  });

  it("handles a draw when scores are tied", async () => {
    const id = uniqueId();
    await createBattle(id, "React vs Vue?", 2);
    await addContender(id, "alpha", "AlphaAI", "React is better", "Claude");
    await addContender(id, "beta", "TBD", "Vue is better", "");
    await tryActivateBattle(id);
    await addContender(id, "beta", "BetaAI", "Vue is better", "ChatGPT");
    await incrementRound(id);

    // Tied scores: both sides get 60 total
    const tiedScores: RoundScores = {
      alpha_coherence: 60, alpha_evidence: 60, alpha_rhetoric: 60, alpha_total: 60,
      beta_coherence: 60, beta_evidence: 60, beta_rhetoric: 60, beta_total: 60,
    };

    // Round 1 — draw
    await saveArgument(id, 1, "alpha", "React's ecosystem and community size gives it unparalleled library support and job market presence.");
    await saveArgument(id, 1, "beta", "Vue's progressive architecture allows gradual adoption and has superior developer experience scores in surveys.");
    await saveJudgeVerdict(id, 1, "draw", "Both arguments were equally compelling.", tiedScores);
    await incrementRound(id);

    // Round 2 — draw
    await saveArgument(id, 2, "alpha", "React's fiber architecture enables concurrent rendering for complex applications at scale.");
    await saveArgument(id, 2, "beta", "Vue 3's composition API and reactivity system offer the same performance with better ergonomics.");
    await saveJudgeVerdict(id, 2, "draw", "Scores were identical — both frameworks shine in their domains.", tiedScores);

    const preFinal = await getBattle(id);
    const winner = determineFinalWinner(preFinal!);
    await setFinalWinner(id, winner);

    const finalBattle = await getBattle(id);
    expect(finalBattle!.final_winner).toBe("draw");
  });
});

describe("Debate flow — status validations", () => {
  it("returns null for a non-existent battle ID", async () => {
    const battle = await getBattle("ZZZZ");
    expect(battle).toBeNull();
  });

  it("battle alpha and beta contenders are populated correctly", async () => {
    const id = uniqueId();
    await createBattle(id, "Is blockchain useful?", 1);
    await addContender(id, "alpha", "CryptoBot", "Blockchain is revolutionary", "Claude");
    await addContender(id, "beta", "TBD", "Blockchain is overrated", "");

    const battle = await getBattle(id);
    expect(battle!.alpha?.name).toBe("CryptoBot");
    expect(battle!.alpha?.stance).toBe("Blockchain is revolutionary");
    expect(battle!.beta?.name).toBe("TBD");
    expect(battle!.beta?.stance).toBe("Blockchain is overrated");
  });

  it("tracks spectator count correctly", async () => {
    const id = uniqueId();
    await createBattle(id, "Microservices vs monolith?", 1);
    await addContender(id, "alpha", "AlphaAI", "Microservices scale better", "Claude");

    const initial = await getBattle(id);
    expect(initial!.spectator_count).toBe(0);
  });
});
