import { describe, it, expect } from "vitest";
import {
  generateSingleEliminationBracket,
  generateRoundRobinBracket,
  advanceWinner,
  type TournamentMatch,
} from "../services/tournament-engine.js";

// ─── Single elimination ────────────────────────────────────────────────────────

describe("tournament-engine: single elimination", () => {
  it("should generate correct bracket for 4 participants", () => {
    const participants = [
      { name: "Claude", model: "Opus 4.6" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5 Pro" },
      { name: "Llama", model: "3.3 70B" },
    ];

    const result = generateSingleEliminationBracket("TEST", participants);

    // Should have 2 rounds: semis + final
    const round1 = result.matches.filter(m => m.round === 1);
    const round2 = result.matches.filter(m => m.round === 2);

    expect(round1).toHaveLength(2); // 2 semi-final matches
    expect(round2).toHaveLength(1); // 1 final match
    expect(result.participants).toHaveLength(4);

    // Semis should pair 1v2 and 3v4
    expect(round1[0].participant_a_id).toBe("Claude");
    expect(round1[0].participant_b_id).toBe("GPT-4");
    expect(round1[1].participant_a_id).toBe("Gemini");
    expect(round1[1].participant_b_id).toBe("Llama");
  });

  it("should generate correct bracket for 8 participants", () => {
    const participants = Array.from({ length: 8 }, (_, i) => ({
      name: `P${i + 1}`,
      model: "Model",
    }));

    const result = generateSingleEliminationBracket("TEST", participants);

    const round1 = result.matches.filter(m => m.round === 1);
    const round2 = result.matches.filter(m => m.round === 2);
    const round3 = result.matches.filter(m => m.round === 3);

    expect(round1).toHaveLength(4); // 4 quarter-finals
    expect(round2).toHaveLength(2); // 2 semi-finals
    expect(round3).toHaveLength(1); // 1 final
    expect(result.participants).toHaveLength(8);
  });

  it("should handle odd number of participants (byes)", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5" },
    ];

    const result = generateSingleEliminationBracket("TEST", participants);

    // 3 participants → bracket size 4 (2^2)
    // Round 1: 2 matches (1 real, 1 with bye)
    // Round 2: 1 final
    const round1 = result.matches.filter(m => m.round === 1);
    const round2 = result.matches.filter(m => m.round === 2);

    expect(round1).toHaveLength(2);
    expect(round2).toHaveLength(1);
    expect(result.participants).toHaveLength(3);

    // The match with a bye should auto-advance
    const byeMatch = round1.find(m => !m.participant_a_id || !m.participant_b_id);
    if (byeMatch) {
      expect(byeMatch.status).toBe("finished");
      expect(byeMatch.winner_participant_id).toBeTruthy();
    }
  });

  it("should auto-advance bye matches immediately", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
    ];

    const result = generateSingleEliminationBracket("TEST", participants);

    // 2 participants → 1 match in round 1, 1 final in round 2
    const round1 = result.matches.filter(m => m.round === 1);
    expect(round1).toHaveLength(1);
    // No byes with 2 participants
    expect(round1[0].participant_a_id).toBe("Claude");
    expect(round1[0].participant_b_id).toBe("GPT-4");
  });
});

// ─── Round robin ───────────────────────────────────────────────────────────────

describe("tournament-engine: round robin", () => {
  it("should generate all pairings for 4 participants", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5" },
      { name: "Llama", model: "3.3" },
    ];

    const result = generateRoundRobinBracket("TEST", participants);

    // 4 participants → 4C2 = 6 pairings
    expect(result.matches).toHaveLength(6);
    expect(result.participants).toHaveLength(4);

    // Every participant should play every other
    const pairings = new Set<string>();
    for (const m of result.matches) {
      const key = [m.participant_a_id, m.participant_b_id].sort().join(" vs ");
      pairings.add(key);
    }
    expect(pairings.size).toBe(6); // All unique pairings
  });

  it("should generate all pairings for 3 participants", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5" },
    ];

    const result = generateRoundRobinBracket("TEST", participants);

    // 3 participants → 3C2 = 3 pairings
    expect(result.matches).toHaveLength(3);
  });
});

// ─── Advance winner ────────────────────────────────────────────────────────────

describe("tournament-engine: advance winner", () => {
  it("should advance winner to correct slot in next round", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5" },
      { name: "Llama", model: "3.3" },
    ];

    const result = generateSingleEliminationBracket("TEST", participants);
    const round1 = result.matches.filter(m => m.round === 1);

    // Semi 1 winner: Claude (position 1 → alpha slot in final)
    round1[0].winner_participant_id = "Claude";
    round1[0].status = "finished";
    advanceWinner(result.matches as any, round1[0] as any);

    // Claude should be in final as alpha
    const final = result.matches.find(m => m.round === 2);
    expect(final?.participant_a_id).toBe("Claude");
    expect(final?.participant_b_id).toBeNull(); // Semi 2 not yet decided
  });

  it("should set champion when final is decided", () => {
    const participants = [
      { name: "Claude", model: "Opus" },
      { name: "GPT-4", model: "GPT-4o" },
      { name: "Gemini", model: "2.5" },
      { name: "Llama", model: "3.3" },
    ];

    const result = generateSingleEliminationBracket("TEST", participants);
    const round1 = result.matches.filter(m => m.round === 1);

    // Semi 1: Claude wins
    round1[0].winner_participant_id = "Claude";
    round1[0].status = "finished";
    advanceWinner(result.matches as any, round1[0] as any);

    // Semi 2: Gemini wins
    round1[1].winner_participant_id = "Gemini";
    round1[1].status = "finished";
    advanceWinner(result.matches as any, round1[1] as any);

    // Final should have Claude vs Gemini
    const final = result.matches.find(m => m.round === 2);
    expect(final?.participant_a_id).toBe("Claude");
    expect(final?.participant_b_id).toBe("Gemini");
  });
});
