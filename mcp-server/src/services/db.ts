import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Battle, Contender, Round, RoundScores, BattleStatus, RoundWinner, GameMode, ChessGameState, ContenderSide } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

// ─── Singleton sql.js DB ──────────────────────────────────────────────────────

let _db: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;

  const SQL = await initSqlJs();

  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  initSchema(_db);
  return _db;
}

// Persist DB to disk after each write operation
function persist(db: SqlJsDatabase): void {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS battles (
      id              TEXT PRIMARY KEY,
      topic           TEXT NOT NULL,
      game_mode       TEXT NOT NULL DEFAULT 'debate',
      status          TEXT NOT NULL DEFAULT 'waiting',
      max_rounds      INTEGER NOT NULL DEFAULT 3,
      current_round   INTEGER NOT NULL DEFAULT 0,
      spectator_count INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      started_at      TEXT,
      finished_at     TEXT,
      final_winner    TEXT
    );

    CREATE TABLE IF NOT EXISTS contenders (
      battle_id    TEXT NOT NULL,
      side         TEXT NOT NULL,
      name         TEXT NOT NULL,
      stance       TEXT NOT NULL,
      device       TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      PRIMARY KEY (battle_id, side),
      FOREIGN KEY (battle_id) REFERENCES battles(id)
    );

    CREATE TABLE IF NOT EXISTS rounds (
      battle_id       TEXT NOT NULL,
      round_number    INTEGER NOT NULL,
      alpha_argument  TEXT NOT NULL DEFAULT '',
      beta_argument   TEXT NOT NULL DEFAULT '',
      winner          TEXT,
      judge_verdict   TEXT NOT NULL DEFAULT '',
      alpha_coherence INTEGER NOT NULL DEFAULT 0,
      beta_coherence  INTEGER NOT NULL DEFAULT 0,
      alpha_evidence  INTEGER NOT NULL DEFAULT 0,
      beta_evidence   INTEGER NOT NULL DEFAULT 0,
      alpha_rhetoric  INTEGER NOT NULL DEFAULT 0,
      beta_rhetoric   INTEGER NOT NULL DEFAULT 0,
      alpha_total     INTEGER NOT NULL DEFAULT 0,
      beta_total      INTEGER NOT NULL DEFAULT 0,
      completed_at    TEXT,
      PRIMARY KEY (battle_id, round_number),
      FOREIGN KEY (battle_id) REFERENCES battles(id)
    );

    CREATE TABLE IF NOT EXISTS chess_games (
      battle_id    TEXT PRIMARY KEY,
      fen          TEXT NOT NULL,
      pgn          TEXT NOT NULL DEFAULT '',
      moves_json   TEXT NOT NULL DEFAULT '[]',
      last_side    TEXT,
      updated_at   TEXT NOT NULL,
      FOREIGN KEY (battle_id) REFERENCES battles(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  persist(db);
}

// ─── Query helpers ────────────────────────────────────────────────────────────

type SqlParam = string | number | null | Uint8Array;

function queryAll<T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows[0] ?? null;
}

function run(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): void {
  db.run(sql, params);
  persist(db);
}

// ─── Battle assembly ──────────────────────────────────────────────────────────

function assembleBattle(
  row: Record<string, unknown>,
  contenderRows: Record<string, unknown>[],
  roundRows: Record<string, unknown>[]
): Battle {
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
      beta_coherence:  r["beta_coherence"] as number,
      alpha_evidence:  r["alpha_evidence"] as number,
      beta_evidence:   r["beta_evidence"] as number,
      alpha_rhetoric:  r["alpha_rhetoric"] as number,
      beta_rhetoric:   r["beta_rhetoric"] as number,
      alpha_total:     r["alpha_total"] as number,
      beta_total:      r["beta_total"] as number,
    },
  }));

  return {
    id: row["id"] as string,
    topic: row["topic"] as string,
    game_mode: (row["game_mode"] as GameMode) ?? "debate",
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
    chess: undefined, // populated by getBattle if game_mode === "chess"
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createBattle(id: string, topic: string, maxRounds: number, gameMode: GameMode = "debate"): Promise<Battle> {
  const db = await getDb();
  const now = new Date().toISOString();
  run(db, `
    INSERT INTO battles (id, topic, game_mode, status, max_rounds, current_round, spectator_count, created_at)
    VALUES (?, ?, ?, 'waiting', ?, 0, 0, ?)
  `, [id, topic, gameMode, maxRounds, now]);
  return (await getBattle(id))!;
}

export async function getBattle(id: string): Promise<Battle | null> {
  const db = await getDb();
  const row = queryOne<Record<string, unknown>>(db, "SELECT * FROM battles WHERE id = ?", [id]);
  if (!row) return null;
  const contenderRows = queryAll<Record<string, unknown>>(db, "SELECT * FROM contenders WHERE battle_id = ?", [id]);
  const roundRows = queryAll<Record<string, unknown>>(db, "SELECT * FROM rounds WHERE battle_id = ? ORDER BY round_number", [id]);
  const battle = assembleBattle(row, contenderRows, roundRows);

  // Load chess state if applicable
  if (battle.game_mode === "chess") {
    const chessRow = queryOne<Record<string, unknown>>(db, "SELECT * FROM chess_games WHERE battle_id = ?", [id]);
    if (chessRow) {
      battle.chess = {
        fen: chessRow["fen"] as string,
        pgn: chessRow["pgn"] as string,
        moves: JSON.parse((chessRow["moves_json"] as string) ?? "[]"),
        turn: (chessRow["fen"] as string).includes(" w ") ? "white" : "black",
        side_to_move: "alpha",
        is_check: false,
        is_checkmate: false,
        is_draw: false,
        legal_moves: [],
        move_count: 0,
      };
      // Rebuild live state from moves for accurate game status
      const { rebuildFromMoves } = await import("./chess-engine.js");
      battle.chess = rebuildFromMoves(battle.chess.moves);
    }
  }

  return battle;
}

export async function listActiveBattles(): Promise<Battle[]> {
  const db = await getDb();
  const rows = queryAll<{ id: string }>(db,
    "SELECT id FROM battles WHERE status IN ('waiting','active','judging') ORDER BY created_at DESC LIMIT 20"
  );
  const battles = await Promise.all(rows.map(r => getBattle(r.id)));
  return battles.filter((b): b is Battle => b !== null);
}

export async function addContender(
  battleId: string, side: "alpha" | "beta",
  name: string, stance: string, device: string
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  run(db, `
    INSERT OR REPLACE INTO contenders (battle_id, side, name, stance, device, connected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [battleId, side, name, stance, device, now]);
}

export async function updateBattleStatus(battleId: string, status: BattleStatus): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  if (status === "active") {
    run(db, "UPDATE battles SET status = ?, started_at = ? WHERE id = ?", [status, now, battleId]);
  } else if (status === "finished") {
    run(db, "UPDATE battles SET status = ?, finished_at = ? WHERE id = ?", [status, now, battleId]);
  } else {
    run(db, "UPDATE battles SET status = ? WHERE id = ?", [status, battleId]);
  }
}

export async function setFinalWinner(battleId: string, winner: "alpha" | "beta" | "draw"): Promise<void> {
  const db = await getDb();
  run(db, "UPDATE battles SET final_winner = ?, status = 'finished', finished_at = ? WHERE id = ?",
    [winner, new Date().toISOString(), battleId]);
}

export async function incrementRound(battleId: string): Promise<void> {
  const db = await getDb();
  run(db, "UPDATE battles SET current_round = current_round + 1 WHERE id = ?", [battleId]);
}

export async function saveArgument(
  battleId: string, round: number,
  side: "alpha" | "beta", argument: string
): Promise<void> {
  const db = await getDb();
  run(db, "INSERT OR IGNORE INTO rounds (battle_id, round_number) VALUES (?, ?)", [battleId, round]);
  const col = side === "alpha" ? "alpha_argument" : "beta_argument";
  run(db, `UPDATE rounds SET ${col} = ? WHERE battle_id = ? AND round_number = ?`, [argument, battleId, round]);
}

export async function saveJudgeVerdict(
  battleId: string, round: number,
  winner: "alpha" | "beta" | "draw",
  verdict: string, scores: RoundScores
): Promise<void> {
  const db = await getDb();
  run(db, `
    UPDATE rounds SET
      winner = ?, judge_verdict = ?,
      alpha_coherence = ?, beta_coherence = ?,
      alpha_evidence  = ?, beta_evidence  = ?,
      alpha_rhetoric  = ?, beta_rhetoric  = ?,
      alpha_total = ?,     beta_total = ?,
      completed_at = ?
    WHERE battle_id = ? AND round_number = ?
  `, [
    winner, verdict,
    scores.alpha_coherence, scores.beta_coherence,
    scores.alpha_evidence,  scores.beta_evidence,
    scores.alpha_rhetoric,  scores.beta_rhetoric,
    scores.alpha_total,     scores.beta_total,
    new Date().toISOString(),
    battleId, round,
  ]);
}

export async function incrementSpectators(battleId: string): Promise<void> {
  const db = await getDb();
  run(db, "UPDATE battles SET spectator_count = spectator_count + 1 WHERE id = ?", [battleId]);
}

// ─── Cleanup (called by cleanup job) ─────────────────────────────────────────

export async function archiveOldBattles(): Promise<number> {
  const db = await getDb();
  // Archive battles finished more than 7 days ago
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const before = queryAll<{ id: string }>(db,
    "SELECT id FROM battles WHERE status = 'finished' AND finished_at < ?", [cutoff]
  );
  if (before.length === 0) return 0;
  run(db, "DELETE FROM rounds WHERE battle_id IN (SELECT id FROM battles WHERE status = 'finished' AND finished_at < ?)", [cutoff]);
  run(db, "DELETE FROM contenders WHERE battle_id IN (SELECT id FROM battles WHERE status = 'finished' AND finished_at < ?)", [cutoff]);
  run(db, "DELETE FROM chess_games WHERE battle_id IN (SELECT id FROM battles WHERE status = 'finished' AND finished_at < ?)", [cutoff]);
  run(db, "DELETE FROM battles WHERE status = 'finished' AND finished_at < ?", [cutoff]);
  return before.length;
}

// ─── Chess game persistence ───────────────────────────────────────────────────

export async function getChessGame(battleId: string): Promise<ChessGameState | null> {
  const db = await getDb();
  const row = queryOne<Record<string, unknown>>(db, "SELECT * FROM chess_games WHERE battle_id = ?", [battleId]);
  if (!row) return null;
  const { rebuildFromMoves } = await import("./chess-engine.js");
  const moves = JSON.parse((row["moves_json"] as string) ?? "[]");
  return rebuildFromMoves(moves);
}

export async function saveChessMove(
  battleId: string,
  state: ChessGameState,
  lastSide: ContenderSide | null
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  run(db, `
    INSERT INTO chess_games (battle_id, fen, pgn, moves_json, last_side, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(battle_id) DO UPDATE SET
      fen = excluded.fen,
      pgn = excluded.pgn,
      moves_json = excluded.moves_json,
      last_side = excluded.last_side,
      updated_at = excluded.updated_at
  `, [battleId, state.fen, state.pgn, JSON.stringify(state.moves), lastSide, now]);
}

// ─── Settings configuration ───────────────────────────────────────────────────

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  run(db, `
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `, [key, value]);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = queryAll<{ key: string; value: string }>(db, "SELECT * FROM settings");
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
