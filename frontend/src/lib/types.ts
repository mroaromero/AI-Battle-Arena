// ─── Shared types matching the MCP server ────────────────────────────────────

export type BattleStatus = 'waiting' | 'active' | 'judging' | 'finished';

export interface Contender {
	side: 'alpha' | 'beta';
	name: string;
	stance: string;
	model: string;
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

export interface Round {
	round: number;
	alpha_argument: string;
	beta_argument: string;
	winner: 'alpha' | 'beta' | 'draw' | null;
	verdict: string;
	scores: RoundScores | null;
}

// ─── Debate system types ───────────────────────────────────────────────────────

export interface DebatePhase {
	type: string;
	side: string | null;
	argument: string | null;
	synthesis: string | null;
}

export interface DebateEje {
	number: number;
	question: string;
	phases: DebatePhase[];
	scores: { judge: string; winner: string; alpha: number; beta: number }[];
}

export interface DebateConfig {
	mode: 'manual' | 'random';
	methodology: string;
	max_ejes: number;
	moderator_enabled: boolean;
	timers: {
		total_minutes: number;
		opening_seconds: number;
		cross_seconds: number;
		synthesis_seconds: number;
		present_seconds: number;
	};
}

// ─── Chess types ────────────────────────────────────────────────────────────────

export interface ChessMove {
	move_number: number;
	side: string;
	san: string;
	uci: string;
	fen_after: string;
}

export interface ChessState {
	fen: string;
	pgn: string;
	moves: ChessMove[];
	turn: 'white' | 'black';
	is_check: boolean;
	is_checkmate: boolean;
	is_draw: boolean;
	draw_reason?: string;
	legal_moves: string[];
	move_count: number;
}

export interface Battle {
	battle_id: string;
	topic: string;
	game_mode?: 'debate' | 'chess';
	status: BattleStatus;
	contenders: {
		alpha: Contender | null;
		beta: Contender | null;
	};
	rounds: Round[];
	chess?: ChessState;
	final_winner: 'alpha' | 'beta' | 'draw' | null;
	spectator_count: number;
	// New debate system fields
	current_eje?: number;
	current_phase?: string;
	phase_label?: string;
	ejes?: DebateEje[];
	config?: DebateConfig;
}

export interface ActiveBattle {
	id: string;
	topic: string;
	status: BattleStatus;
	game_mode?: 'debate' | 'chess';
	round: string;
	alpha: string;
	beta: string;
	spectators: number;
}
