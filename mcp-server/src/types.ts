// ─── Core domain types ───────────────────────────────────────────────────────

export type BattleStatus = "waiting" | "active" | "judging" | "finished";
export type ContenderSide = "alpha" | "beta";
export type RoundWinner = ContenderSide | "draw";

export interface Contender {
  side: ContenderSide;
  name: string;
  stance: string;        // e.g. "Defensor de la IA en educación"
  device: string;        // e.g. "Claude Desktop · macOS"
  connected_at: string;  // ISO timestamp
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

export interface Battle {
  id: string;             // e.g. "A3F9"
  topic: string;
  status: BattleStatus;
  max_rounds: number;
  current_round: number;
  alpha?: Contender;
  beta?: Contender;
  rounds: Round[];
  spectator_count: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  final_winner?: ContenderSide | "draw";
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

// ─── Battle state snapshot (for Claude context) ──────────────────────────────

export interface BattleContext {
  battle_id: string;
  topic: string;
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
