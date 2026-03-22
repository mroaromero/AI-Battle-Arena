/**
 * Integration tests for the full chess game flow.
 *
 * Strategy:
 * - Set DB_PATH to an isolated temp file BEFORE any db imports.
 * - Test the chess-engine functions directly (pure functions, no DB needed).
 * - Test the DB-integrated chess flow: create → join → move → checkmate.
 * - Scholar's Mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
 */

import os from "os";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ─── Isolate DB ───────────────────────────────────────────────────────────────
const tempDbPath = path.join(os.tmpdir(), `chess-test-${randomBytes(6).toString("hex")}.db`);
process.env.DB_PATH = tempDbPath;

// ─── Imports (after env var) ──────────────────────────────────────────────────
import { Chess } from "chess.js";
import {
  createBattle,
  getBattle,
  addContender,
  updateBattleStatus,
  saveChessMove,
  setFinalWinner,
} from "../services/db.js";
import {
  createInitialChessState,
  makeMove,
  rebuildFromMoves,
} from "../services/chess-engine.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueId(): string {
  return randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
}

async function setupChessGame(id: string): Promise<void> {
  await createBattle(id, "Partida de Ajedrez", 999, "chess");
  await addContender(id, "alpha", "WhitePlayer", "Blancas ♔", "Claude Desktop");
  await addContender(id, "beta", "TBD", "Negras ♚", "");

  const initialState = createInitialChessState();
  await saveChessMove(id, initialState, null);

  // Beta joins
  await addContender(id, "beta", "BlackPlayer", "Negras ♚", "ChatGPT Web");
  await updateBattleStatus(id, "active");
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(() => {
  try { fs.unlinkSync(tempDbPath); } catch { /* ignore */ }
});

// ─── Chess engine unit tests (pure functions) ─────────────────────────────────

describe("Chess engine — pure functions", () => {
  it("creates a valid initial chess state", () => {
    const state = createInitialChessState();

    expect(state.fen).toContain("rnbqkbnr"); // starting position
    expect(state.turn).toBe("white");
    expect(state.is_checkmate).toBe(false);
    expect(state.is_draw).toBe(false);
    expect(state.is_check).toBe(false);
    expect(state.legal_moves.length).toBeGreaterThan(0);
    expect(state.moves).toHaveLength(0);
    expect(state.move_count).toBe(0);
  });

  it("accepts a valid pawn move e4", () => {
    const initial = createInitialChessState();
    const result = makeMove(initial.fen, initial.moves, "alpha", "e4");

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.state!.turn).toBe("black"); // now black's turn
    expect(result.state!.moves).toHaveLength(1);
    expect(result.state!.moves[0]!.san).toBe("e4");
    expect(result.state!.moves[0]!.side).toBe("alpha");
  });

  it("accepts UCI format move e2e4", () => {
    const initial = createInitialChessState();
    const result = makeMove(initial.fen, initial.moves, "alpha", "e2e4");

    expect(result.success).toBe(true);
    expect(result.state!.moves[0]!.san).toBe("e4");
  });

  it("rejects an invalid move", () => {
    const initial = createInitialChessState();
    const result = makeMove(initial.fen, initial.moves, "alpha", "e9"); // invalid square

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("inválido");
  });

  it("rejects an illegal move (moving to occupied square without capture)", () => {
    const initial = createInitialChessState();
    // Try to move pawn two squares forward then another two — not legal
    const after_e4 = makeMove(initial.fen, initial.moves, "alpha", "e4");
    expect(after_e4.success).toBe(true);

    // Try moving the e4 pawn to e6 (skipping a square, illegal)
    const result = makeMove(after_e4.state!.fen, after_e4.state!.moves, "beta", "e6");
    // This might succeed as e6 for black or fail — let's just verify the engine handles it
    // e6 for black FROM starting position after 1.e4 is actually a valid move for black's e7 pawn
    // so let's try an actual illegal move
    const illegalResult = makeMove(after_e4.state!.fen, after_e4.state!.moves, "beta", "a6a3");
    expect(illegalResult.success).toBe(false);
  });

  it("detects checkmate on Scholar's Mate", () => {
    // Scholar's Mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const initial = createInitialChessState();

    const m1w = makeMove(initial.fen, initial.moves, "alpha", "e4");
    expect(m1w.success).toBe(true);

    const m1b = makeMove(m1w.state!.fen, m1w.state!.moves, "beta", "e5");
    expect(m1b.success).toBe(true);

    const m2w = makeMove(m1b.state!.fen, m1b.state!.moves, "alpha", "Bc4");
    expect(m2w.success).toBe(true);

    const m2b = makeMove(m2w.state!.fen, m2w.state!.moves, "beta", "Nc6");
    expect(m2b.success).toBe(true);

    const m3w = makeMove(m2b.state!.fen, m2b.state!.moves, "alpha", "Qh5");
    expect(m3w.success).toBe(true);

    const m3b = makeMove(m3w.state!.fen, m3w.state!.moves, "beta", "Nf6");
    expect(m3b.success).toBe(true);
    expect(m3b.state!.is_checkmate).toBe(false); // not checkmate yet

    // 4.Qxf7# — checkmate!
    const m4w = makeMove(m3b.state!.fen, m3b.state!.moves, "alpha", "Qxf7");
    expect(m4w.success).toBe(true);
    expect(m4w.state!.is_checkmate).toBe(true);
    expect(m4w.state!.is_draw).toBe(false);
    expect(m4w.state!.move_count).toBe(7);
  });

  it("rebuilds state correctly from move list", () => {
    // Play e4, e5 then rebuild
    const initial = createInitialChessState();
    const m1 = makeMove(initial.fen, initial.moves, "alpha", "e4");
    const m2 = makeMove(m1.state!.fen, m1.state!.moves, "beta", "e5");

    const rebuilt = rebuildFromMoves(m2.state!.moves);
    expect(rebuilt.fen).toBe(m2.state!.fen);
    expect(rebuilt.move_count).toBe(2);
    expect(rebuilt.turn).toBe("white");
  });
});

// ─── Chess DB integration tests ───────────────────────────────────────────────

describe("Chess flow — game creation and joining", () => {
  it("creates a chess game in 'waiting' status with initial board", async () => {
    const id = uniqueId();
    await createBattle(id, "Partida de Ajedrez", 999, "chess");
    await addContender(id, "alpha", "WhitePlayer", "Blancas ♔", "Claude Desktop");
    await addContender(id, "beta", "TBD", "Negras ♚", "");

    const initialState = createInitialChessState();
    await saveChessMove(id, initialState, null);

    const battle = await getBattle(id);
    expect(battle).not.toBeNull();
    expect(battle!.status).toBe("waiting");
    expect(battle!.game_mode).toBe("chess");
    expect(battle!.chess).toBeDefined();
    expect(battle!.chess!.turn).toBe("white");
    expect(battle!.chess!.move_count).toBe(0);
  });

  it("transitions to 'active' when Black joins", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    const battle = await getBattle(id);
    expect(battle!.status).toBe("active");
    expect(battle!.alpha?.name).toBe("WhitePlayer");
    expect(battle!.beta?.name).toBe("BlackPlayer");
  });
});

describe("Chess flow — move making and persistence", () => {
  it("persists a move and updates the board state in DB", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    const battle = await getBattle(id);
    const chess = battle!.chess!;

    const result = makeMove(chess.fen, chess.moves, "alpha", "e4");
    expect(result.success).toBe(true);

    const newState = result.state!;
    newState.side_to_move = "beta";
    await saveChessMove(id, newState, "alpha");

    const updated = await getBattle(id);
    expect(updated!.chess!.turn).toBe("black");
    expect(updated!.chess!.move_count).toBe(1);
    expect(updated!.chess!.moves[0]!.san).toBe("e4");
  });

  it("executes Scholar's Mate sequence and detects checkmate", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    // Scholar's Mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const moves = [
      { side: "alpha" as const, move: "e4" },
      { side: "beta" as const, move: "e5" },
      { side: "alpha" as const, move: "Bc4" },
      { side: "beta" as const, move: "Nc6" },
      { side: "alpha" as const, move: "Qh5" },
      { side: "beta" as const, move: "Nf6" },
      { side: "alpha" as const, move: "Qxf7" }, // checkmate
    ];

    let battle = await getBattle(id);
    let state = battle!.chess!;

    for (const { side, move: mv } of moves) {
      const result = makeMove(state.fen, state.moves, side, mv);
      expect(result.success).toBe(true);
      state = result.state!;
      state.side_to_move = state.turn === "white" ? "alpha" : "beta";
      await saveChessMove(id, state, side);
    }

    // Verify checkmate is detected
    expect(state.is_checkmate).toBe(true);
    expect(state.is_draw).toBe(false);
    expect(state.move_count).toBe(7);

    // Set winner
    await setFinalWinner(id, "alpha");

    const finalBattle = await getBattle(id);
    expect(finalBattle!.final_winner).toBe("alpha");
    expect(finalBattle!.status).toBe("finished");
  });

  it("rejects move when it is not the player's turn", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    const battle = await getBattle(id);
    const chess = battle!.chess!;

    // It's white's turn, but beta (black) tries to move
    const result = makeMove(chess.fen, chess.moves, "beta", "e5");
    // The move e5 is actually valid for black, but chess engine doesn't check turn ownership
    // The turn validation lives in the tool/API layer — chess-engine just applies moves
    // So we test the FEN-level: after e4 by white, black's fen turn is 'b', white can't play again
    const whiteMove = makeMove(chess.fen, chess.moves, "alpha", "e4");
    expect(whiteMove.success).toBe(true);

    // Now white tries to move again (it's black's turn in FEN)
    const illegalWhiteMove = makeMove(whiteMove.state!.fen, whiteMove.state!.moves, "alpha", "d4");
    // chess.js will reject this because it's black's turn
    expect(illegalWhiteMove.success).toBe(false);
  });
});

describe("Chess flow — game status after completion", () => {
  it("marks game as finished after checkmate", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    // Quick Scholar's Mate
    const scholarsMateMoves = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7"];
    const sides: Array<"alpha" | "beta"> = ["alpha", "beta", "alpha", "beta", "alpha", "beta", "alpha"];

    let battle = await getBattle(id);
    let state = battle!.chess!;

    for (let i = 0; i < scholarsMateMoves.length; i++) {
      const result = makeMove(state.fen, state.moves, sides[i]!, scholarsMateMoves[i]!);
      expect(result.success).toBe(true);
      state = result.state!;
      await saveChessMove(id, state, sides[i]!);
    }

    await setFinalWinner(id, "alpha");

    const final = await getBattle(id);
    expect(final!.status).toBe("finished");
    expect(final!.final_winner).toBe("alpha");
    expect(final!.finished_at).toBeDefined();
    expect(final!.chess!.is_checkmate).toBe(true);
  });

  it("correctly identifies the draw after stalemate position", () => {
    // Stalemate FEN: black king on a8, white queen on b6, white king on c6
    // Black has no legal moves but is not in check → stalemate
    const stalemateFen = "k7/8/KQ6/8/8/8/8/8 b - - 0 1";

    const game = new Chess(stalemateFen);

    expect(game.isStalemate()).toBe(true);
    expect(game.isDraw()).toBe(true);
    expect(game.isCheckmate()).toBe(false);
  });
});

describe("Chess flow — board state consistency", () => {
  it("move history accumulates correctly across multiple moves", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    const openingMoves = [
      { side: "alpha" as const, move: "e4" },
      { side: "beta" as const, move: "e5" },
      { side: "alpha" as const, move: "Nf3" },
      { side: "beta" as const, move: "Nc6" },
    ];

    let battle = await getBattle(id);
    let state = battle!.chess!;

    for (const { side, move: mv } of openingMoves) {
      const result = makeMove(state.fen, state.moves, side, mv);
      expect(result.success).toBe(true);
      state = result.state!;
      await saveChessMove(id, state, side);
    }

    const updated = await getBattle(id);
    expect(updated!.chess!.move_count).toBe(4);
    expect(updated!.chess!.moves[0]!.san).toBe("e4");
    expect(updated!.chess!.moves[1]!.san).toBe("e5");
    expect(updated!.chess!.moves[2]!.san).toBe("Nf3");
    expect(updated!.chess!.moves[3]!.san).toBe("Nc6");

    // Verify sides alternate correctly
    expect(updated!.chess!.moves[0]!.side).toBe("alpha");
    expect(updated!.chess!.moves[1]!.side).toBe("beta");
    expect(updated!.chess!.moves[2]!.side).toBe("alpha");
    expect(updated!.chess!.moves[3]!.side).toBe("beta");
  });

  it("FEN state is consistent after persisting and reloading", async () => {
    const id = uniqueId();
    await setupChessGame(id);

    let battle = await getBattle(id);
    let state = battle!.chess!;

    const result = makeMove(state.fen, state.moves, "alpha", "d4");
    expect(result.success).toBe(true);
    const expectedFen = result.state!.fen;
    await saveChessMove(id, result.state!, "alpha");

    const reloaded = await getBattle(id);
    expect(reloaded!.chess!.fen).toBe(expectedFen);
  });
});
