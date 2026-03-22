/**
 * Unit tests for Zod validation schemas used in MCP tools.
 *
 * Tests edge cases: empty strings, too-long inputs, invalid IDs.
 * No DB or network calls needed — pure schema validation.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Schemas extracted from tool definitions ──────────────────────────────────
// These mirror the inputSchema definitions in battle.ts and chess.ts

const createBattleSchema = z.object({
  topic:        z.string().min(10).max(300).describe("Debate topic"),
  alpha_stance: z.string().min(5).max(150).describe("Alpha's stance"),
  beta_stance:  z.string().min(5).max(150).describe("Beta's stance"),
  my_name:      z.string().min(2).max(50).describe("Your name"),
  my_device:    z.string().max(80).default("AI Desktop").describe("Your AI client"),
  max_rounds:   z.number().int().min(1).max(5).default(3).describe("Number of rounds"),
}).strict();

const joinBattleSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_name:   z.string().min(2).max(50).describe("Your name"),
  my_device: z.string().max(80).default("AI Web").describe("Your AI client"),
}).strict();

const getContextSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_side:   z.enum(["alpha", "beta"]).describe("Your side"),
}).strict();

const submitArgumentSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_side:   z.enum(["alpha", "beta"]).describe("Your side"),
  argument:  z.string().min(20).max(2000).describe("Your argument"),
}).strict();

const createChessSchema = z.object({
  my_name:   z.string().min(2).max(50).describe("Your name"),
  my_device: z.string().max(80).default("AI Desktop").describe("Your AI client"),
}).strict();

const joinChessSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_name:   z.string().min(2).max(50).describe("Your name"),
  my_device: z.string().max(80).default("AI Web").describe("Your AI client"),
}).strict();

const makeMoveSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_side:   z.enum(["alpha", "beta"]).describe("Your side (alpha=White, beta=Black)"),
  move:      z.string().min(2).max(10).describe("Move in SAN or UCI format"),
}).strict();

const getBoardSchema = z.object({
  battle_id: z.string().length(4).toUpperCase().describe("Room code"),
  my_side:   z.enum(["alpha", "beta"]).describe("Your side"),
}).strict();

// ─── arena_create_battle validation ──────────────────────────────────────────

describe("arena_create_battle schema validation", () => {
  it("accepts valid input with all required fields", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace human teachers in schools?",
      alpha_stance: "AI can replace teachers effectively",
      beta_stance: "Human teachers are irreplaceable",
      my_name: "Claude",
    });
    expect(result.success).toBe(true);
  });

  it("applies default values for optional fields", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace human teachers?",
      alpha_stance: "Yes, AI can do it",
      beta_stance: "No, humans are better",
      my_name: "Claude",
    });
    expect(result.success).toBe(true);
    expect(result.data?.my_device).toBe("AI Desktop");
    expect(result.data?.max_rounds).toBe(3);
  });

  it("rejects topic shorter than 10 characters", () => {
    const result = createBattleSchema.safeParse({
      topic: "Too short",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("least 10");
  });

  it("rejects topic longer than 300 characters", () => {
    const result = createBattleSchema.safeParse({
      topic: "A".repeat(301),
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty topic", () => {
    const result = createBattleSchema.safeParse({
      topic: "",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects alpha_stance shorter than 5 characters", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes",
      beta_stance: "No I disagree",
      my_name: "Claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects alpha_stance longer than 150 characters", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "A".repeat(151),
      beta_stance: "No I disagree",
      my_name: "Claude",
    });
    expect(result.success).toBe(false);
  });

  it("rejects my_name shorter than 2 characters", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects max_rounds = 0", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
      max_rounds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects max_rounds = 6 (above maximum)", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
      max_rounds: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects max_rounds = 2.5 (not an integer)", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
      max_rounds: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = createBattleSchema.safeParse({
      topic: "Should AI replace teachers?",
      alpha_stance: "Yes I agree",
      beta_stance: "No I disagree",
      my_name: "Claude",
      unknown_field: "should fail",
    });
    expect(result.success).toBe(false);
  });
});

// ─── arena_join_battle validation ─────────────────────────────────────────────

describe("arena_join_battle schema validation", () => {
  it("accepts a valid 4-character battle ID", () => {
    const result = joinBattleSchema.safeParse({
      battle_id: "A3F9",
      my_name: "GPT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects battle_id shorter than 4 characters", () => {
    const result = joinBattleSchema.safeParse({
      battle_id: "ABC",
      my_name: "GPT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects battle_id longer than 4 characters", () => {
    const result = joinBattleSchema.safeParse({
      battle_id: "ABCDE",
      my_name: "GPT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty battle_id", () => {
    const result = joinBattleSchema.safeParse({
      battle_id: "",
      my_name: "GPT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing my_name", () => {
    const result = joinBattleSchema.safeParse({
      battle_id: "A3F9",
    });
    expect(result.success).toBe(false);
  });
});

// ─── arena_get_context validation ─────────────────────────────────────────────

describe("arena_get_context schema validation", () => {
  it("accepts 'alpha' as my_side", () => {
    const result = getContextSchema.safeParse({ battle_id: "A3F9", my_side: "alpha" });
    expect(result.success).toBe(true);
  });

  it("accepts 'beta' as my_side", () => {
    const result = getContextSchema.safeParse({ battle_id: "A3F9", my_side: "beta" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid my_side value", () => {
    const result = getContextSchema.safeParse({ battle_id: "A3F9", my_side: "gamma" });
    expect(result.success).toBe(false);
  });

  it("rejects my_side = 'Alpha' (case-sensitive enum)", () => {
    const result = getContextSchema.safeParse({ battle_id: "A3F9", my_side: "Alpha" });
    expect(result.success).toBe(false);
  });
});

// ─── arena_submit_argument validation ────────────────────────────────────────

describe("arena_submit_argument schema validation", () => {
  it("accepts argument of exactly 20 characters (minimum)", () => {
    const result = submitArgumentSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      argument: "A".repeat(20),
    });
    expect(result.success).toBe(true);
  });

  it("accepts argument of exactly 2000 characters (maximum)", () => {
    const result = submitArgumentSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      argument: "A".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects argument shorter than 20 characters", () => {
    const result = submitArgumentSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      argument: "Too short arg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects argument longer than 2000 characters", () => {
    const result = submitArgumentSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      argument: "A".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty argument", () => {
    const result = submitArgumentSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      argument: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── arena_create_chess_match validation ─────────────────────────────────────

describe("arena_create_chess_match schema validation", () => {
  it("accepts valid input", () => {
    const result = createChessSchema.safeParse({ my_name: "Stockfish" });
    expect(result.success).toBe(true);
    expect(result.data?.my_device).toBe("AI Desktop");
  });

  it("rejects my_name shorter than 2 characters", () => {
    const result = createChessSchema.safeParse({ my_name: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects my_name longer than 50 characters", () => {
    const result = createChessSchema.safeParse({ my_name: "A".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("rejects my_device longer than 80 characters", () => {
    const result = createChessSchema.safeParse({
      my_name: "Stockfish",
      my_device: "A".repeat(81),
    });
    expect(result.success).toBe(false);
  });
});

// ─── arena_make_move validation ───────────────────────────────────────────────

describe("arena_make_move schema validation", () => {
  it("accepts standard SAN moves", () => {
    const validMoves = ["e4", "Nf3", "O-O", "O-O-O", "Bc4", "Qxf7", "e8=Q"];
    for (const move of validMoves) {
      const result = makeMoveSchema.safeParse({
        battle_id: "A3F9",
        my_side: "alpha",
        move,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts UCI format moves", () => {
    const result = makeMoveSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      move: "e2e4",
    });
    expect(result.success).toBe(true);
  });

  it("rejects move shorter than 2 characters", () => {
    const result = makeMoveSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      move: "e",
    });
    expect(result.success).toBe(false);
  });

  it("rejects move longer than 10 characters", () => {
    const result = makeMoveSchema.safeParse({
      battle_id: "A3F9",
      my_side: "alpha",
      move: "e2e4excessively",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid my_side in chess", () => {
    const result = makeMoveSchema.safeParse({
      battle_id: "A3F9",
      my_side: "white",
      move: "e4",
    });
    expect(result.success).toBe(false);
  });
});

// ─── arena_get_board validation ───────────────────────────────────────────────

describe("arena_get_board schema validation", () => {
  it("accepts valid input", () => {
    const result = getBoardSchema.safeParse({ battle_id: "A3F9", my_side: "beta" });
    expect(result.success).toBe(true);
  });

  it("rejects missing battle_id", () => {
    const result = getBoardSchema.safeParse({ my_side: "alpha" });
    expect(result.success).toBe(false);
  });

  it("rejects battle_id of wrong length", () => {
    const result = getBoardSchema.safeParse({ battle_id: "AB", my_side: "alpha" });
    expect(result.success).toBe(false);
  });
});
