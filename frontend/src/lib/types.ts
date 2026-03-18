// ─── Shared types matching the MCP server ────────────────────────────────────

export type BattleStatus = 'waiting' | 'active' | 'judging' | 'finished';

export interface Contender {
	side: 'alpha' | 'beta';
	name: string;
	stance: string;
	device: string;
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
	status: BattleStatus;
	contenders: {
		alpha: Contender | null;
		beta: Contender | null;
	};
	rounds: Round[];
	chess?: ChessState;
	final_winner: 'alpha' | 'beta' | 'draw' | null;
	spectator_count: number;
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
