import jwt from "jsonwebtoken";
import type { Database as SqlJsDatabase } from "sql.js";

// ─── Configuration ──────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? process.env.ADMIN_SECRET ?? "ai-battle-arena-jwt-secret";
const BASE_URL = process.env.BASE_URL ?? "https://ai-battle-arena-ngrt.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://ai-battle-arena-jade.vercel.app";

const REDIRECT_URI = `${BASE_URL}/auth/google/callback`;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  google_id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface JWTPayload {
  uid: string;
  email: string;
}

// ─── DB helpers (injected by caller) ────────────────────────────────────────────

type SqlParam = string | number | null;

function queryAll<T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne<T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T | null {
  return queryAll<T>(db, sql, params)[0] ?? null;
}

// ─── Users schema ───────────────────────────────────────────────────────────────

export function initUsersSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      google_id   TEXT UNIQUE NOT NULL,
      email       TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url  TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
}

// ─── Google OAuth ───────────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface GoogleTokens {
  access_token: string;
  id_token: string;
  refresh_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
  verified_email: boolean;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo | null> {
  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[Auth] Google token exchange failed:", await tokenRes.text());
    return null;
  }

  const tokens: GoogleTokens = await tokenRes.json();

  // Fetch user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    console.error("[Auth] Google user info fetch failed:", await userRes.text());
    return null;
  }

  return userRes.json();
}

// ─── User CRUD ──────────────────────────────────────────────────────────────────

export function findOrCreateUser(db: SqlJsDatabase, googleUser: GoogleUserInfo): User {
  const now = new Date().toISOString();

  // Check if user exists
  const existing = queryOne<User>(db, "SELECT * FROM users WHERE google_id = ?", [googleUser.id]);

  if (existing) {
    // Update info from Google (name/avatar might have changed)
    db.run(
      "UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE google_id = ?",
      [googleUser.email, googleUser.name, googleUser.picture, now, googleUser.id]
    );
    // Re-query to get updated data
    return queryOne<User>(db, "SELECT * FROM users WHERE google_id = ?", [googleUser.id])!;
  }

  // Create new user
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.run(
    "INSERT INTO users (id, google_id, email, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, googleUser.id, googleUser.email, googleUser.name, googleUser.picture, now, now]
  );

  return queryOne<User>(db, "SELECT * FROM users WHERE id = ?", [id])!;
}

export function getUserById(db: SqlJsDatabase, userId: string): User | null {
  return queryOne<User>(db, "SELECT * FROM users WHERE id = ?", [userId]);
}

export function updateUserProfile(db: SqlJsDatabase, userId: string, data: { display_name?: string }): User | null {
  const now = new Date().toISOString();
  if (data.display_name !== undefined) {
    db.run("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?", [data.display_name, now, userId]);
  }
  return getUserById(db, userId);
}

export function deleteUser(db: SqlJsDatabase, userId: string): boolean {
  const user = getUserById(db, userId);
  if (!user) return false;
  db.run("DELETE FROM users WHERE id = ?", [userId]);
  return true;
}

// ─── JWT ────────────────────────────────────────────────────────────────────────

export function createJWT(user: User): string {
  return jwt.sign({ uid: user.id, email: user.email } as JWTPayload, JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}
