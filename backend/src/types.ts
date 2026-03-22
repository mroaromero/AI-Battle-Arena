// ─── Core domain types ───────────────────────────────────────────────────────

export type GameMode = "debate" | "chess";
export type BattleStatus = "waiting" | "active" | "judging" | "finished";
export type ContenderSide = "alpha" | "beta";
export type RoundWinner = ContenderSide | "draw";
export type ChessColor = "white" | "black";

export interface Contender {
  side: ContenderSide;
  name: string;
  stance: string;        // e.g. "Defensor de la IA en educación" | "Blancas" | "Negras"
  model: string;         // e.g. "Opus 4.6" | "GPT-4o" | "Gemini 2.5"
  connected_at: string;  // ISO timestamp
}

// ─── Debate types ─────────────────────────────────────────────────────────────

export interface Round {
  round_number: number;
  alpha_argument: string;
  beta_argument: string;
  winner: RoundWinner;
  judge_verdict: string;
  scores: RoundScores;
  completed_at: string;
}

export interface RoundScores {
  alpha_coherence: number;
  beta_coherence: number;
  alpha_evidence: number;
  beta_evidence: number;
  alpha_rhetoric: number;
  beta_rhetoric: number;
  alpha_total: number;
  beta_total: number;
}

// ─── Chess types ──────────────────────────────────────────────────────────────

export interface ChessMove {
  move_number: number;    // sequential counter (1, 2, 3...)
  side: ContenderSide;    // who made the move
  san: string;            // Standard Algebraic Notation: "e4", "Nf3", "O-O"
  uci: string;            // UCI format: "e2e4", "g1f3"
  fen_after: string;      // board FEN after the move
  made_at: string;        // ISO timestamp
}

export interface ChessGameState {
  fen: string;            // current position
  pgn: string;            // full game in PGN format
  moves: ChessMove[];
  turn: ChessColor;       // whose turn it is ("white" | "black")
  side_to_move: ContenderSide; // "alpha" | "beta"
  is_check: boolean;
  is_checkmate: boolean;
  is_draw: boolean;
  draw_reason?: string;   // "stalemate" | "insufficient_material" | "threefold_repetition" | "fifty_moves"
  legal_moves: string[];  // legal moves in SAN for the current position
  move_count: number;
}

// ─── Core Battle type ─────────────────────────────────────────────────────────

export interface Battle {
  id: string;             // e.g. "A3F9"
  topic: string;          // for debate: theme; for chess: "Partida de Ajedrez"
  game_mode: GameMode;
  status: BattleStatus;
  max_rounds: number;     // for debate: 1-5; for chess: effectively unlimited
  current_round: number;
  alpha?: Contender;
  beta?: Contender;
  rounds: Round[];        // populated only in debate mode
  chess?: ChessGameState; // populated only in chess mode
  spectator_count: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  final_winner?: ContenderSide | "draw";
  // New debate system fields
  debate_config?: string | Record<string, unknown>;
  current_eje?: number;
  current_phase?: string;
  phase_started_at?: string;
  global_started_at?: string;
}

// ─── Tool response helpers ────────────────────────────────────────────────────

export interface ToolSuccess<T> {
  ok: true;
  data: T;
}

export interface ToolError {
  ok: false;
  error: string;
  hint?: string;
}

export type ToolResult<T> = ToolSuccess<T> | ToolError;

// ─── Battle state snapshot (for AI context) ──────────────────────────────────

export interface BattleContext {
  battle_id: string;
  topic: string;
  game_mode: GameMode;
  status: BattleStatus;
  my_side: ContenderSide;
  my_stance: string;
  opponent_stance: string;
  current_round: number;
  max_rounds: number;
  rounds_history: {
    round: number;
    my_argument: string;
    opponent_argument: string;
    winner: RoundWinner;
    judge_verdict: string;
  }[];
  current_scores: {
    my_total: number;
    opponent_total: number;
  };
  is_my_turn: boolean;
  instructions: string;
}

// ─── Chess context (for AI agents in chess mode) ─────────────────────────────

export interface ChessContext {
  battle_id: string;
  game_mode: "chess";
  status: BattleStatus;
  my_side: ContenderSide;
  my_color: ChessColor;
  opponent_color: ChessColor;
  my_name: string;
  opponent_name: string;
  fen: string;
  pgn: string;
  turn: ChessColor;
  is_my_turn: boolean;
  is_check: boolean;
  is_checkmate: boolean;
  is_draw: boolean;
  draw_reason?: string;
  legal_moves: string[];  // SAN moves you can make right now
  move_history: { move: string; side: ContenderSide; san: string }[];
  move_count: number;
  instructions: string;
}
