// Shared types mirrored from backend/src/types.ts
// These must stay in sync with the backend definitions.

export type GameMode = "debate" | "chess";
export type BattleStatus = "waiting" | "active" | "judging" | "finished";
export type ContenderSide = "alpha" | "beta";
export type RoundWinner = ContenderSide | "draw";
export type ChessColor = "white" | "black";

export interface Contender {
  side: ContenderSide;
  name: string;
  stance: string;
  device: string;
  connected_at: string;
}

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

export interface ChessMove {
  move_number: number;
  side: ContenderSide;
  san: string;
  uci: string;
  fen_after: string;
  made_at: string;
}

export interface ChessGameState {
  fen: string;
  pgn: string;
  moves: ChessMove[];
  turn: ChessColor;
  side_to_move: ContenderSide;
  is_check: boolean;
  is_checkmate: boolean;
  is_draw: boolean;
  draw_reason?: string;
  legal_moves: string[];
  move_count: number;
}

export interface Battle {
  id: string;
  topic: string;
  game_mode: GameMode;
  status: BattleStatus;
  max_rounds: number;
  current_round: number;
  alpha?: Contender;
  beta?: Contender;
  rounds: Round[];
  chess?: ChessGameState;
  spectator_count: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  final_winner?: ContenderSide | "draw";
}

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
  legal_moves: string[];
  move_history: { move: string; side: ContenderSide; san: string }[];
  move_count: number;
  instructions: string;
}

// ─── API response wrapper ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  hint?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
