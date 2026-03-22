// ─── Tournament Engine — Single elimination bracket generation ─────────────────

import type { DebateConfig } from "./debate-engine.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  topic: string;
  game_mode: "debate" | "chess";
  bracket_type: BracketType;
  status: TournamentStatus;
  max_participants: number;
  debate_config: string | null;  // JSON string
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  champion_participant_id: string | null;
}

export type BracketType = "single_elimination" | "round_robin";
export type TournamentStatus = "waiting" | "active" | "finished";

export interface TournamentParticipant {
  id: string;
  tournament_id: string;
  position: number;          // bracket position (1, 2, 3, 4...)
  name: string;
  model: string;
  eliminated: boolean;
  eliminated_at: string | null;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;             // 1 = quarter, 2 = semi, 3 = final
  position: number;          // position within round (1, 2, 3...)
  battle_id: string | null;  // linked battle (created when match starts)
  participant_a_id: string | null;  // who plays Alpha
  participant_b_id: string | null;  // who plays Beta
  winner_participant_id: string | null;
  status: MatchStatus;
  created_at: string;
  finished_at: string | null;
}

export type MatchStatus = "pending" | "active" | "finished";

export interface BracketRound {
  round: number;
  name: string;        // "Cuartos", "Semis", "Final"
  matches: TournamentMatch[];
}

export interface Bracket {
  tournament: Tournament;
  participants: TournamentParticipant[];
  rounds: BracketRound[];
  champion: TournamentParticipant | null;
}

// ─── Bracket generation ────────────────────────────────────────────────────────

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return "FINAL";
  if (round === totalRounds - 1) return "SEMIFINAL";
  if (round === totalRounds - 2) return "CUARTOS";
  return `RONDA ${round}`;
}

export function generateSingleEliminationBracket(
  tournamentId: string,
  participants: { name: string; model: string }[]
): { participants: Omit<TournamentParticipant, "id" | "tournament_id">[]; matches: Omit<TournamentMatch, "id" | "tournament_id">[] } {
  const count = participants.length;

  // Find the next power of 2 >= count
  let bracketSize = 1;
  while (bracketSize < count) bracketSize *= 2;

  // Pad with byes
  const totalRounds = Math.log2(bracketSize);

  // Create participants with positions
  const participantEntries: Omit<TournamentParticipant, "id" | "tournament_id">[] = participants.map((p, i) => ({
    position: i + 1,
    name: p.name,
    model: p.model,
    eliminated: false,
    eliminated_at: null,
  }));

  // Generate matches for each round
  const matches: Omit<TournamentMatch, "id" | "tournament_id">[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);

    for (let pos = 1; pos <= matchesInRound; pos++) {
      let participantA: string | null = null;
      let participantB: string | null = null;

      if (round === 1) {
        // First round: pair participants by position
        const idxA = (pos - 1) * 2;
        const idxB = (pos - 1) * 2 + 1;
        participantA = idxA < count ? participants[idxA].name : null;  // bye if no opponent
        participantB = idxB < count ? participants[idxB].name : null;
      }
      // Later rounds: participants are determined by winners

      matches.push({
        round,
        position: pos,
        battle_id: null,
        participant_a_id: participantA,
        participant_b_id: participantB,
        winner_participant_id: null,
        status: "pending",
        created_at: new Date().toISOString(),
        finished_at: null,
      });
    }
  }

  // Auto-advance byes in round 1
  for (const match of matches.filter(m => m.round === 1)) {
    if (match.participant_a_id && !match.participant_b_id) {
      match.winner_participant_id = match.participant_a_id;
      match.status = "finished";
      match.finished_at = new Date().toISOString();
      // Advance to next round
      advanceWinner(matches, match);
    } else if (!match.participant_a_id && match.participant_b_id) {
      match.winner_participant_id = match.participant_b_id;
      match.status = "finished";
      match.finished_at = new Date().toISOString();
      advanceWinner(matches, match);
    }
  }

  return { participants: participantEntries, matches };
}

export function generateRoundRobinBracket(
  tournamentId: string,
  participants: { name: string; model: string }[]
): { participants: Omit<TournamentParticipant, "id" | "tournament_id">[]; matches: Omit<TournamentMatch, "id" | "tournament_id">[] } {
  const count = participants.length;
  const participantEntries: Omit<TournamentParticipant, "id" | "tournament_id">[] = participants.map((p, i) => ({
    position: i + 1,
    name: p.name,
    model: p.model,
    eliminated: false,
    eliminated_at: null,
  }));

  const matches: Omit<TournamentMatch, "id" | "tournament_id">[] = [];
  let round = 1;
  let matchPos = 1;

  // Each participant plays every other participant once
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      matches.push({
        round,
        position: matchPos,
        battle_id: null,
        participant_a_id: participants[i].name,
        participant_b_id: participants[j].name,
        winner_participant_id: null,
        status: "pending",
        created_at: new Date().toISOString(),
        finished_at: null,
      });
      matchPos++;
      if (matchPos > count / 2) {
        round++;
        matchPos = 1;
      }
    }
  }

  return { participants: participantEntries, matches };
}

// ─── Match advancement ─────────────────────────────────────────────────────────

export function advanceWinner(
  allMatches: Omit<TournamentMatch, "id" | "tournament_id">[],
  completedMatch: Omit<TournamentMatch, "id" | "tournament_id">
): void {
  if (!completedMatch.winner_participant_id) return;

  const nextRound = completedMatch.round + 1;
  const nextPosition = Math.ceil(completedMatch.position / 2);
  const isAlphaSlot = completedMatch.position % 2 === 1;

  const nextMatch = allMatches.find(m => m.round === nextRound && m.position === nextPosition);
  if (!nextMatch) return;  // This was the final

  if (isAlphaSlot) {
    nextMatch.participant_a_id = completedMatch.winner_participant_id;
  } else {
    nextMatch.participant_b_id = completedMatch.winner_participant_id;
  }

  // Check if both slots filled and it's a bye match
  if (nextMatch.participant_a_id && !nextMatch.participant_b_id) {
    nextMatch.winner_participant_id = nextMatch.participant_a_id;
    nextMatch.status = "finished";
    nextMatch.finished_at = new Date().toISOString();
    advanceWinner(allMatches, nextMatch);
  } else if (!nextMatch.participant_a_id && nextMatch.participant_b_id) {
    nextMatch.winner_participant_id = nextMatch.participant_b_id;
    nextMatch.status = "finished";
    nextMatch.finished_at = new Date().toISOString();
    advanceWinner(allMatches, nextMatch);
  }
}

// ─── Bracket visualization helper ──────────────────────────────────────────────

export function structureBracket(
  matches: TournamentMatch[],
  participants: TournamentParticipant[]
): BracketRound[] {
  const rounds = new Map<number, TournamentMatch[]>();

  for (const match of matches) {
    if (!rounds.has(match.round)) rounds.set(match.round, []);
    rounds.get(match.round)!.push(match);
  }

  const totalRounds = Math.max(...rounds.keys());

  return Array.from(rounds.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, matches]) => ({
      round,
      name: getRoundName(round, totalRounds),
      matches: matches.sort((a, b) => a.position - b.position),
    }));
}

// ─── Default tournament config ─────────────────────────────────────────────────

export function createDefaultTournamentConfig(): Partial<Tournament> {
  return {
    game_mode: "debate",
    bracket_type: "single_elimination",
    max_participants: 8,
    status: "waiting",
  };
}
