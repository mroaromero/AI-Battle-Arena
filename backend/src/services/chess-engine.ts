import { Chess } from "chess.js";
import type { ChessGameState, ContenderSide } from "../types.js";

// ─── Chess Engine Wrapper ─────────────────────────────────────────────────────
// Wraps chess.js with helpers for the Arena's MCP tools.
// All logic is deterministic — no LLM needed for move validation.

export function createInitialChessState(): ChessGameState {
  const game = new Chess();
  return buildState(game, []);
}

export interface MoveResult {
  success: boolean;
  error?: string;
  state?: ChessGameState;
}

// Attempt to make a move. Accepts SAN ("e4", "Nf3", "O-O") or UCI ("e2e4").
export function makeMove(
  currentFen: string,
  currentMoves: ChessGameState["moves"],
  side: ContenderSide,
  moveStr: string,
  moveSan?: string // optional pre-computed SAN
): MoveResult {
  const game = new Chess(currentFen);

  // First try as SAN (most human-readable), then UCI
  let result = null;
  try {
    result = game.move(moveStr);
  } catch {
    // Try UCI format: "e2e4" → { from: "e2", to: "e4" }
    if (moveStr.length >= 4) {
      try {
        result = game.move({
          from: moveStr.slice(0, 2),
          to: moveStr.slice(2, 4),
          promotion: moveStr[4] ?? undefined,
        });
      } catch {
        return { success: false, error: `Movimiento inválido: "${moveStr}". Usa notación algebraica (ej: e4, Nf3, O-O) o UCI (ej: e2e4).` };
      }
    } else {
      return { success: false, error: `Movimiento inválido: "${moveStr}". Usa notación algebraica (ej: e4, Nf3, O-O) o UCI (ej: e2e4).` };
    }
  }

  if (!result) {
    return { success: false, error: `Movimiento ilegal en la posición actual: "${moveStr}".` };
  }

  const newMove = {
    move_number: currentMoves.length + 1,
    side,
    san: result.san,
    uci: `${result.from}${result.to}${result.promotion ?? ""}`,
    fen_after: game.fen(),
    made_at: new Date().toISOString(),
  };

  const state = buildState(game, [...currentMoves, newMove]);
  return { success: true, state };
}

// Rebuild a game state from a list of moves (for DB reconstruction)
export function rebuildFromMoves(moves: ChessGameState["moves"]): ChessGameState {
  const game = new Chess();
  for (const m of moves) {
    game.move(m.san);
  }
  return buildState(game, moves);
}

// Determine who should move next based on FEN turn
export function getFenTurn(fen: string): "white" | "black" {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}

// Build a full ChessGameState from a chess.js instance
function buildState(game: Chess, moves: ChessGameState["moves"]): ChessGameState {
  const verbose = game.moves({ verbose: false }) as string[];
  const turn = game.turn() === "w" ? "white" : "black";

  let drawReason: string | undefined;
  const isDraw = game.isDraw();
  if (isDraw) {
    if (game.isStalemate()) drawReason = "stalemate";
    else if (game.isInsufficientMaterial()) drawReason = "insufficient_material";
    else if (game.isThreefoldRepetition()) drawReason = "threefold_repetition";
    else drawReason = "fifty_moves";
  }

  return {
    fen: game.fen(),
    pgn: game.pgn(),
    moves,
    turn,
    side_to_move: "alpha", // overridden by callers based on color assignment
    is_check: game.inCheck(),
    is_checkmate: game.isCheckmate(),
    is_draw: isDraw,
    draw_reason: drawReason,
    legal_moves: verbose,
    move_count: moves.length,
  };
}
