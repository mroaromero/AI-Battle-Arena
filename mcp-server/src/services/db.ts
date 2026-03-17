import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import type { Battle, Contender, Round, RoundScores, BattleStatus, RoundWinner } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

// ─── Singleton DB connection ──────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  import("fs").then(fs => fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }));

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS battles (
      id            TEXT PRIMARY KEY,
      topic         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'waiting',
      max_rounds    INTEGER NOT NULL DEFAULT 3,
      current_round INTEGER NOT NULL DEFAULT 0,
      spectator_count INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      started_at    TEXT,
      finished_at   TEXT,
      final_winner  TEXT
    );

    CREATE TABLE IF NOT EXISTS contenders (
      battle_id     TEXT NOT NULL,
      side          TEXT NOT NULL,
      name          TEXT NOT NULL,
      stance        TEXT NOT NULL,
      device        TEXT NOT NULL,
      connected_at  TEXT NOT NULL,
      PRIMARY KEY (battle_id, side),
      FOREIGN KEY (battle_id) REFERENCES battles(id)
    );

    CREATE TABLE IF NOT EXISTS rounds (
      battle_id         TEXT NOT NULL,
      round_number      INTEGER NOT NULL,
      alpha_argument    TEXT NOT NULL DEFAULT '',
      beta_argument     TEXT NOT NULL DEFAULT '',
      winner            TEXT,
      judge_verdict     TEXT NOT NULL DEFAULT '',
      alpha_coherence   INTEGER NOT NULL DEFAULT 0,
      beta_coherence    INTEGER NOT NULL DEFAULT 0,
      alpha_evidence    INTEGER NOT NULL DEFAULT 0,
      beta_evidence     INTEGER NOT NULL DEFAULT 0,
      alpha_rhetoric    INTEGER NOT NULL DEFAULT 0,
      beta_rhetoric     INTEGER NOT NULL DEFAULT 0,
      alpha_total       INTEGER NOT NULL DEFAULT 0,
      beta_total        INTEGER NOT NULL DEFAULT 0,
      completed_at      TEXT,
      PRIMARY KEY (battle_id, round_number),
      FOREIGN KEY (battle_id) REFERENCES battles(id)
    );
  `);
}

// ─── Battle CRUD ──────────────────────────────────────────────────────────────

export function createBattle(id: string, topic: string, maxRounds: number): Battle {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO battles (id, topic, status, max_rounds, current_round, spectator_count, created_at)
    VALUES (?, ?, 'waiting', ?, 0, 0, ?)
  `).run(id, topic, maxRounds, now);

  return getBattle(id)!;
}

export function getBattle(id: string): Battle | null {
  const db = getDb();

  const row = db.prepare("SELECT * FROM battles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const contenderRows = db.prepare("SELECT * FROM contenders WHERE battle_id = ?").all(id) as Record<string, unknown>[];
  const roundRows = db.prepare("SELECT * FROM rounds WHERE battle_id = ? ORDER BY round_number").all(id) as Record<string, unknown>[];

  const contenders: Record<string, Contender> = {};
  for (const c of contenderRows) {
    contenders[c["side"] as string] = {
      side: c["side"] as "alpha" | "beta",
      name: c["name"] as string,
      stance: c["stance"] as string,
      device: c["device"] as string,
      connected_at: c["connected_at"] as string,
    };
  }

  const rounds: Round[] = roundRows.map(r => ({
    round_number: r["round_number"] as number,
    alpha_argument: r["alpha_argument"] as string,
    beta_argument: r["beta_argument"] as string,
    winner: r["winner"] as RoundWinner,
    judge_verdict: r["judge_verdict"] as string,
    completed_at: r["completed_at"] as string,
    scores: {
      alpha_coherence: r["alpha_coherence"] as number,
      beta_coherence: r["beta_coherence"] as number,
      alpha_evidence: r["alpha_evidence"] as number,
      beta_evidence: r["beta_evidence"] as number,
      alpha_rhetoric: r["alpha_rhetoric"] as number,
      beta_rhetoric: r["beta_rhetoric"] as number,
      alpha_total: r["alpha_total"] as number,
      beta_total: r["beta_total"] as number,
    }
  }));

  return {
    id: row["id"] as string,
    topic: row["topic"] as string,
    status: row["status"] as BattleStatus,
    max_rounds: row["max_rounds"] as number,
    current_round: row["current_round"] as number,
    spectator_count: row["spectator_count"] as number,
    created_at: row["created_at"] as string,
    started_at: row["started_at"] as string | undefined,
    finished_at: row["finished_at"] as string | undefined,
    final_winner: row["final_winner"] as "alpha" | "beta" | "draw" | undefined,
    alpha: contenders["alpha"],
    beta: contenders["beta"],
    rounds,
  };
}

export function listActiveBattles(): Battle[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id FROM battles WHERE status IN ('waiting','active','judging') ORDER BY created_at DESC LIMIT 20"
  ).all() as { id: string }[];
  return rows.map(r => getBattle(r.id)!).filter(Boolean);
}

export function addContender(
  battleId: string,
  side: "alpha" | "beta",
  name: string,
  stance: string,
  device: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO contenders (battle_id, side, name, stance, device, connected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(battleId, side, name, stance, device, now);
}

export function updateBattleStatus(battleId: string, status: BattleStatus): void {
  const db = getDb();
  const now = new Date().toISOString();

  const updates: string[] = ["status = ?"];
  const params: unknown[] = [status];

  if (status === "active") { updates.push("started_at = ?"); params.push(now); }
  if (status === "finished") { updates.push("finished_at = ?"); params.push(now); }

  params.push(battleId);
  db.prepare(`UPDATE battles SET ${updates.join(", ")} WHERE id = ?`).run(...params);
}

export function setFinalWinner(battleId: string, winner: "alpha" | "beta" | "draw"): void {
  getDb().prepare("UPDATE battles SET final_winner = ?, status = 'finished', finished_at = ? WHERE id = ?")
    .run(winner, new Date().toISOString(), battleId);
}

export function incrementRound(battleId: string): void {
  getDb().prepare("UPDATE battles SET current_round = current_round + 1 WHERE id = ?").run(battleId);
}

export function saveArgument(battleId: string, round: number, side: "alpha" | "beta", argument: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO rounds (battle_id, round_number) VALUES (?, ?)
  `).run(battleId, round);

  const col = side === "alpha" ? "alpha_argument" : "beta_argument";
  db.prepare(`UPDATE rounds SET ${col} = ? WHERE battle_id = ? AND round_number = ?`)
    .run(argument, battleId, round);
}

export function saveJudgeVerdict(
  battleId: string,
  round: number,
  winner: "alpha" | "beta" | "draw",
  verdict: string,
  scores: RoundScores
): void {
  const db = getDb();
  db.prepare(`
    UPDATE rounds SET
      winner = ?, judge_verdict = ?,
      alpha_coherence = ?, beta_coherence = ?,
      alpha_evidence = ?, beta_evidence = ?,
      alpha_rhetoric = ?, beta_rhetoric = ?,
      alpha_total = ?, beta_total = ?,
      completed_at = ?
    WHERE battle_id = ? AND round_number = ?
  `).run(
    winner, verdict,
    scores.alpha_coherence, scores.beta_coherence,
    scores.alpha_evidence, scores.beta_evidence,
    scores.alpha_rhetoric, scores.beta_rhetoric,
    scores.alpha_total, scores.beta_total,
    new Date().toISOString(),
    battleId, round
  );
}

export function incrementSpectators(battleId: string): void {
  getDb().prepare("UPDATE battles SET spectator_count = spectator_count + 1 WHERE id = ?").run(battleId);
}
