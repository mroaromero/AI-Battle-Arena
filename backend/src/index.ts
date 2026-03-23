import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { swaggerSpec } from "./swagger.js";
import { registerAllTools } from "./tools/battle.js";
import { startCleanupJob, stopCleanupJob } from "./services/cleanup.js";
import {
  createBattle, getBattle, addContender, updateBattleStatus,
  listActiveBattles, listArchivedBattles, listBattleRooms, createBattleRooms, deleteBattleRoom,
  getLeaderboard,
  saveArgument, saveJudgeVerdict,
  setFinalWinner, incrementRound, incrementSpectators,
  tryActivateBattle, saveChessMove,
  saveDebateConfig, saveDebateEjes,
  createTournament, getTournament, listTournaments, updateTournamentStatus, setTournamentChampion,
  addTournamentParticipants, getTournamentParticipants, addTournamentMatches, getTournamentMatches,
  updateTournamentMatch, advanceTournamentWinner, deleteTournament,
  getAllSettings, getSetting, setSetting, getBattleStats,
} from "./services/db.js";
import { generateSingleEliminationBracket, generateRoundRobinBracket } from "./services/tournament-engine.js";
import { judgeRound } from "./services/judge.js";
import { createInitialChessState, makeMove } from "./services/chess-engine.js";
import {
  generateBattleId, buildBattleContext, buildChessContext,
  determineFinalWinner, ok as apiOk, err as apiErr,
} from "./services/utils.js";
import {
  getGoogleAuthUrl, exchangeGoogleCode, findOrCreateUser,
  getUserById, updateUserProfile, deleteUser,
  createJWT, verifyJWT,
  type User,
} from "./services/auth.js";

// ─── Server initialization ────────────────────────────────────────────────────

const VERSION = "2.0.0";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://ai-battle-arena-jade.vercel.app";

const server = new McpServer({
  name: "battle-arena-mcp-server",
  version: VERSION,
});

registerAllTools(server);

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();

  // CORS — allow frontend origin (Vercel) + localhost dev
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, MCP clients)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "HEAD", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "MCP-Protocol-Version"],
    credentials: true,
  }));

  app.use(express.json());
  app.use(cookieParser());

  // ── Health check ─────────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "battle-arena-mcp", version: VERSION });
  });

  // ── API Documentation ───────────────────────────────────────────────────────
  const spec = swaggerJSDoc(swaggerSpec);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec as any, { customCss: ".swagger-ui .topbar { display: none }" }));
  app.get("/api/docs/spec", (_req, res) => res.json(spec));

  // ── Admin rate limiter — brute-force protection ───────────────────────────────
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max: 20,               // 20 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, slow down." },
  });

  // Warn at startup if ADMIN_SECRET is not set — admin endpoints will be inaccessible
  if (!process.env.ADMIN_SECRET) {
    console.warn("[BattleArena MCP] WARNING: ADMIN_SECRET is not set. Admin endpoints will return 403 Forbidden.");
  }

  // ── Admin API ────────────────────────────────────────────────────────────────────
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;
    
    if (!adminSecret) {
      // We must explicitly `return` so TypeScript knows we end execution here for this route.
      res.status(403).json({ error: "Admin access is not configured. Set ADMIN_SECRET environment variable." });
      return;
    }
    
    const expected = `Bearer ${adminSecret}`;
    const authOk = authHeader
      && authHeader.length === expected.length
      && timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
    if (!authOk) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    
    next();
  };

  app.get("/admin/status", adminLimiter, adminAuth, async (_req, res) => {
    try {
      const battles = await getBattleStats();
      res.json({
        online: true,
        version: VERSION,
        uptime: Math.floor(process.uptime()),
        battles,
      });
    } catch {
      res.json({
        online: true,
        version: VERSION,
        uptime: Math.floor(process.uptime()),
        battles: { total: 0, waiting: 0, active: 0, completed: 0 },
      });
    }
  });

  app.get("/admin/config", adminLimiter, adminAuth, async (_req, res) => {
    console.log("[DEBUG] GET /admin/config called");
    const settings = await getAllSettings();
    // Mask API keys so they are not exposed in plaintext over the wire
    const maskedSettings = { ...settings };
    const maskKey = (key: string) => {
      if (maskedSettings[key] && maskedSettings[key].length > 8) {
        maskedSettings[key] = maskedSettings[key].substring(0, 8) + "...****";
      }
    };
    maskKey("ANTHROPIC_API_KEY");
    maskKey("OPENAI_API_KEY");
    maskKey("GOOGLE_API_KEY");
    maskKey("OPENROUTER_API_KEY");
    maskKey("GROQ_API_KEY");
    
    res.json(maskedSettings);
  });

  app.post("/admin/config", adminLimiter, adminAuth, async (req, res) => {
    console.log("[DEBUG] POST /admin/config received:", JSON.stringify(req.body).substring(0, 200));
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Invalid request body: expected a JSON object" });
      return;
    }
    const settingsToUpdate = body as Record<string, string>;
    for (const [key, value] of Object.entries(settingsToUpdate)) {
      // Avoid saving placeholder masked keys back to the DB
      if (value && typeof value === "string" && !value.includes("...****")) {
        await setSetting(key, value);
      }
    }
    res.json({ success: true });
  });

  // ── Provider connection status ──────────────────────────────────────────────
  app.get("/admin/providers/status", adminLimiter, adminAuth, async (_req, res) => {
    try {
      const settings = await getAllSettings();
      const check = (key: string) => Boolean(settings[key] && settings[key].length > 0);
      res.json({
        providers: {
          anthropic: {
            connected: check("ANTHROPIC_API_KEY"),
            method: "api_key",
            setupUrl: "https://console.anthropic.com/settings/keys",
          },
          openai: {
            connected: check("OPENAI_API_KEY"),
            method: "api_key",
            setupUrl: "https://platform.openai.com/api-keys",
          },
          google: {
            connected: check("GOOGLE_API_KEY"),
            method: "api_key",
            setupUrl: "https://aistudio.google.com/app/apikey",
          },
          openrouter: {
            connected: check("OPENROUTER_API_KEY"),
            method: "api_key",
            setupUrl: "https://openrouter.ai/keys",
          },
          groq: {
            connected: check("GROQ_API_KEY"),
            method: "api_key",
            setupUrl: "https://console.groq.com/keys",
          },
        },
      });
    } catch (e) {
      res.status(500).json({ error: `Error getting provider status: ${String(e)}` });
    }
  });

  // ── Test provider connection ────────────────────────────────────────────────
  app.post("/admin/providers/test", adminLimiter, adminAuth, async (req, res) => {
    try {
      const { provider } = req.body ?? {};
      if (!provider || typeof provider !== "string") {
        res.status(400).json({ error: "Missing required field: provider" });
        return;
      }

      const settings = await getAllSettings();
      const keyMap: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY",
        openai: "OPENAI_API_KEY",
        google: "GOOGLE_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
        groq: "GROQ_API_KEY",
      };
      const modelMap: Record<string, string> = {
        anthropic: settings["JUDGE_MODEL_ANTHROPIC"] || "claude-opus-4-5",
        openai: settings["JUDGE_MODEL_OPENAI"] || "gpt-4o",
        google: settings["JUDGE_MODEL_GOOGLE"] || "gemini-2.0-flash",
        openrouter: settings["JUDGE_MODEL_OPENROUTER"] || "google/gemini-2.0-flash-001",
        groq: settings["JUDGE_MODEL_GROQ"] || "llama-3.3-70b-versatile",
      };

      const apiKey = settings[keyMap[provider]];
      if (!apiKey) {
        res.json({ success: false, error: `${provider} API key not configured` });
        return;
      }

      // Minimal chat call to test the key
      let testError: string | null = null;
      try {
        if (provider === "anthropic") {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: modelMap.anthropic, max_tokens: 10, messages: [{ role: "user", content: "Say OK" }] }),
          });
          if (!r.ok) testError = `HTTP ${r.status}: ${await r.text()}`;
        } else if (provider === "openai") {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelMap.openai, max_tokens: 10, messages: [{ role: "user", content: "Say OK" }] }),
          });
          if (!r.ok) testError = `HTTP ${r.status}: ${await r.text()}`;
        } else if (provider === "google") {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelMap.google}:generateContent?key=${apiKey}`;
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Say OK" }] }], generationConfig: { maxOutputTokens: 10 } }),
          });
          if (!r.ok) testError = `HTTP ${r.status}: ${await r.text()}`;
        } else if (provider === "openrouter") {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelMap.openrouter, max_tokens: 10, messages: [{ role: "user", content: "Say OK" }] }),
          });
          if (!r.ok) testError = `HTTP ${r.status}: ${await r.text()}`;
        } else if (provider === "groq") {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelMap.groq, max_tokens: 10, messages: [{ role: "user", content: "Say OK" }] }),
          });
          if (!r.ok) testError = `HTTP ${r.status}: ${await r.text()}`;
        } else {
          res.status(400).json({ error: `Unknown provider: ${provider}` });
          return;
        }
      } catch (e) {
        testError = String(e);
      }

      res.json({ success: !testError, error: testError });
    } catch (e) {
      res.status(500).json({ error: `Error testing provider: ${String(e)}` });
    }
  });

  // ── Available models per provider (static list, no auth required)
  app.get("/admin/models", (_req, res) => {
    res.json({
      anthropic: [
        { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
        { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        { id: "claude-haiku-3-5", name: "Claude Haiku 3.5" },
      ],
      openai: [
        { id: "gpt-4o", name: "GPT-4o" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini" },
        { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
        { id: "o1", name: "o1" },
        { id: "o1-mini", name: "o1 Mini" },
      ],
      google: [
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
        { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
        { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      ],
      openrouter: [
        { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
        { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
        { id: "mistralai/mistral-large", name: "Mistral Large" },
        { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
      ],
      groq: [
        { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
        { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B" },
        { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
      ],
    });
  });

  // ── Admin Room Management ──────────────────────────────────────────────────────
  app.get("/admin/rooms", adminLimiter, adminAuth, async (_req, res) => {
    try {
      const rooms = await listBattleRooms();
      res.json({ ok: true, data: { rooms, total: rooms.length } });
    } catch (e) {
      res.status(500).json({ error: `Error listing rooms: ${String(e)}` });
    }
  });

  app.post("/admin/rooms", adminLimiter, adminAuth, async (req, res) => {
    try {
      const {
        count = 1, topic, alpha_stance, beta_stance, game_mode = "debate", max_rounds = 3,
        debate_config, // new: full debate config object
      } = req.body ?? {};
      if (!topic || !alpha_stance || !beta_stance) {
        res.status(400).json({ error: "Missing required fields: topic, alpha_stance, beta_stance" });
        return;
      }
      if (count < 1 || count > 50) {
        res.status(400).json({ error: "Count must be between 1 and 50" });
        return;
      }
      const ids = await createBattleRooms({ count, topic, alpha_stance, beta_stance, game_mode, max_rounds });

      // Save debate config and ejes for each room if provided
      if (game_mode === "debate" && debate_config) {
        for (const id of ids) {
          saveDebateConfig(id, debate_config);
          if (debate_config.ejes && Array.isArray(debate_config.ejes)) {
            saveDebateEjes(id, debate_config.ejes.filter((e: string) => e.trim()));
          }
        }
      }

      const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
      res.json({
        ok: true,
        data: {
          created: ids.length,
          rooms: ids.map(id => ({
            battle_id: id,
            join_url: game_mode === "chess" ? `${baseUrl}/chess/${id}` : `${baseUrl}/live/${id}`,
          })),
        },
      });
    } catch (e) {
      res.status(500).json({ error: `Error creating rooms: ${String(e)}` });
    }
  });

  app.delete("/admin/rooms/:id", adminLimiter, adminAuth, async (req, res) => {
    try {
      const deleted = await deleteBattleRoom(req.params.id.toUpperCase());
      if (!deleted) { res.status(404).json({ error: "Room not found" }); return; }
      res.json({ ok: true, data: { deleted: true } });
    } catch (e) {
      res.status(500).json({ error: `Error deleting room: ${String(e)}` });
    }
  });

  // ── Tournament Management ──────────────────────────────────────────────────
  app.get("/admin/tournaments", adminLimiter, adminAuth, async (_req, res) => {
    try {
      const tournaments = listTournaments();
      const enriched = tournaments.map(t => {
        const participants = getTournamentParticipants(t["id"] as string);
        const matches = getTournamentMatches(t["id"] as string);
        return {
          ...t,
          participant_count: participants.length,
          match_count: matches.length,
          completed_matches: matches.filter(m => m["status"] === "finished").length,
        };
      });
      res.json({ ok: true, data: { tournaments: enriched, total: enriched.length } });
    } catch (e) {
      res.status(500).json({ error: `Error listing tournaments: ${String(e)}` });
    }
  });

  app.get("/admin/tournaments/:id", adminLimiter, adminAuth, async (req, res) => {
    try {
      const tournament = getTournament(req.params.id);
      if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
      const participants = getTournamentParticipants(req.params.id);
      const matches = getTournamentMatches(req.params.id);
      res.json({ ok: true, data: { tournament, participants, matches } });
    } catch (e) {
      res.status(500).json({ error: `Error getting tournament: ${String(e)}` });
    }
  });

  app.post("/admin/tournaments", adminLimiter, adminAuth, async (req, res) => {
    try {
      const { name, topic, game_mode = "debate", bracket_type = "single_elimination",
              max_participants = 8, participants, debate_config } = req.body ?? {};
      if (!name || !topic) {
        res.status(400).json({ error: "Missing required fields: name, topic" });
        return;
      }
      if (!participants || !Array.isArray(participants) || participants.length < 2) {
        res.status(400).json({ error: "Need at least 2 participants" });
        return;
      }

      const id = createTournament({ name, topic, game_mode, bracket_type, max_participants, debate_config });

      // Generate bracket
      const participantList = participants.map((p: any, i: number) => ({
        name: p.name || `Contender ${i + 1}`,
        model: p.model || "Unknown",
        position: i + 1,
      }));

      addTournamentParticipants(id, participantList);

      let bracketResult;
      if (bracket_type === "round_robin") {
        const { generateRoundRobinBracket } = await import("./services/tournament-engine.js");
        bracketResult = generateRoundRobinBracket(id, participantList);
      } else {
        const { generateSingleEliminationBracket } = await import("./services/tournament-engine.js");
        bracketResult = generateSingleEliminationBracket(id, participantList);
      }

      addTournamentMatches(id, bracketResult.matches.map(m => ({
        round: m.round,
        position: m.position,
        participant_a_id: m.participant_a_id,
        participant_b_id: m.participant_b_id,
      })));

      // Create battle rooms for first round matches
      const firstRoundMatches = bracketResult.matches.filter(m => m.round === 1 && m.participant_a_id && m.participant_b_id);
      for (const match of firstRoundMatches) {
        const battleId = generateBattleId();
        await createBattle(battleId, `${name} — ${topic}`, debate_config ? (debate_config.max_ejes ?? 5) : 3, game_mode as any);
        if (debate_config) {
          saveDebateConfig(battleId, debate_config);
          if (debate_config.ejes) saveDebateEjes(battleId, debate_config.ejes);
        }
        const matchId = `${id}_m${match.round}_${match.position}`;
        updateTournamentMatch(matchId, { battle_id: battleId });
      }

      updateTournamentStatus(id, "active");

      const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
      res.json({
        ok: true,
        data: {
          tournament_id: id,
          bracket_url: `${baseUrl}/tournament/${id}`,
          participants: participantList.length,
          first_round_matches: firstRoundMatches.length,
        },
      });
    } catch (e) {
      res.status(500).json({ error: `Error creating tournament: ${String(e)}` });
    }
  });

  app.delete("/admin/tournaments/:id", adminLimiter, adminAuth, async (req, res) => {
    try {
      const deleted = deleteTournament(req.params.id);
      if (!deleted) { res.status(404).json({ error: "Tournament not found" }); return; }
      res.json({ ok: true, data: { deleted: true } });
    } catch (e) {
      res.status(500).json({ error: `Error deleting tournament: ${String(e)}` });
    }
  });

  // ── Auth endpoints (Google OAuth) ──────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests." },
  });

  // Auth middleware — attaches req.user if JWT is valid
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies?.["arena_token"];
    if (!token) { res.status(401).json(apiErr("Not authenticated")); return; }
    const payload = verifyJWT(token);
    if (!payload) { res.status(401).json(apiErr("Invalid or expired token")); return; }
    (req as any).userId = payload.uid;
    next();
  };

  // Login redirect — sends user to Google
  app.get("/auth/google/login", authLimiter, (req, res) => {
    const frontend = (req.query.redirect as string) || FRONTEND_URL;
    const url = getGoogleAuthUrl(Buffer.from(frontend).toString("base64url"));
    res.redirect(url);
  });

  // Callback — Google redirects here after auth
  app.get("/auth/google/callback", authLimiter, async (req, res) => {
    try {
      const code = req.query.code as string;
      if (!code) { res.status(400).json(apiErr("Missing authorization code")); return; }

      const googleUser = await exchangeGoogleCode(code);
      if (!googleUser) { res.status(401).json(apiErr("Google auth failed")); return; }

      // Get DB for user operations — we need the persist function
      const { default: initSqlJs } = await import("sql.js");
      const { readFileSync, existsSync, mkdirSync, writeFileSync } = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

      const SQL = await initSqlJs();
      mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const db = existsSync(DB_PATH)
        ? new SQL.Database(readFileSync(DB_PATH))
        : new SQL.Database();

      const user = findOrCreateUser(db, googleUser);
      const token = createJWT(user);

      // Persist DB
      const data = db.export();
      writeFileSync(DB_PATH, Buffer.from(data));

      // Determine redirect URL
      const state = req.query.state as string;
      const redirectUrl = state
        ? Buffer.from(state, "base64url").toString()
        : FRONTEND_URL;

      // Set httpOnly cookie and redirect
      const isProd = process.env.NODE_ENV === "production";
      res.cookie("arena_token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "lax" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });

      res.redirect(redirectUrl);
    } catch (e) {
      console.error("[Auth] Callback error:", e);
      res.status(500).json(apiErr("Auth callback failed"));
    }
  });

  // Get current user
  app.get("/auth/me", authLimiter, async (req, res) => {
    const token = req.cookies?.["arena_token"];
    if (!token) { res.json(apiOk({ user: null })); return; }
    const payload = verifyJWT(token);
    if (!payload) { res.json(apiOk({ user: null })); return; }

    // We need a fresh DB read for this — use the getDb from db.ts
    // But db.ts exports are async and we need sync for the middleware...
    // Solution: import getDb and await it
    const { default: initSqlJs } = await import("sql.js");
    const { readFileSync, existsSync, mkdirSync } = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

    const SQL = await initSqlJs();
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = existsSync(DB_PATH)
      ? new SQL.Database(readFileSync(DB_PATH))
      : new SQL.Database();

    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    stmt.bind([payload.uid]);
    if (stmt.step()) {
      const user = stmt.getAsObject();
      stmt.free();
      res.json(apiOk({ user }));
    } else {
      stmt.free();
      res.json(apiOk({ user: null }));
    }
  });

  // Update profile
  app.put("/auth/profile", authLimiter, authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const { display_name } = req.body ?? {};
      if (!display_name || typeof display_name !== "string") {
        res.status(400).json(apiErr("Missing display_name")); return;
      }

      const { default: initSqlJs } = await import("sql.js");
      const { readFileSync, existsSync, mkdirSync, writeFileSync } = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

      const SQL = await initSqlJs();
      mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const db = existsSync(DB_PATH)
        ? new SQL.Database(readFileSync(DB_PATH))
        : new SQL.Database();

      const updated = updateUserProfile(db, userId, { display_name });
      const data = db.export();
      writeFileSync(DB_PATH, Buffer.from(data));

      if (!updated) { res.status(404).json(apiErr("User not found")); return; }
      res.json(apiOk({ user: updated }));
    } catch (e) {
      res.status(500).json(apiErr(`Error updating profile: ${String(e)}`));
    }
  });

  // Delete account
  app.delete("/auth/account", authLimiter, authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId as string;

      const { default: initSqlJs } = await import("sql.js");
      const { readFileSync, existsSync, mkdirSync, writeFileSync } = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/battles.db");

      const SQL = await initSqlJs();
      mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const db = existsSync(DB_PATH)
        ? new SQL.Database(readFileSync(DB_PATH))
        : new SQL.Database();

      const deleted = deleteUser(db, userId);
      const data = db.export();
      writeFileSync(DB_PATH, Buffer.from(data));

      if (!deleted) { res.status(404).json(apiErr("User not found")); return; }

      // Clear cookie
      res.clearCookie("arena_token", { path: "/" });
      res.json(apiOk({ deleted: true, message: "Account deleted successfully" }));
    } catch (e) {
      res.status(500).json(apiErr(`Error deleting account: ${String(e)}`));
    }
  });

  // Logout
  app.post("/auth/logout", authLimiter, (_req, res) => {
    res.clearCookie("arena_token", { path: "/" });
    res.json(apiOk({ logged_out: true }));
  });

  // ── Public REST API — consumed by public-mcp service ─────────────────────
  // No auth required: server-to-server calls from public-mcp (no origin header)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests." },
  });

  // 1. GET /api/battles — List active battles
  app.get("/api/battles", apiLimiter, async (_req, res) => {
    try {
      const battles = await listActiveBattles();
      res.json(apiOk({
        count: battles.length,
        battles: battles.map(b => ({
          id: b.id,
          topic: b.topic,
          game_mode: b.game_mode,
          status: b.status,
          round: `${b.current_round}/${b.max_rounds}`,
          alpha: b.alpha ? `${b.alpha.name} · ${b.alpha.model}` : "Esperando...",
          beta: b.beta && b.beta.name !== "Esperando..." ? `${b.beta.name} · ${b.beta.model}` : "Buscando oponente...",
          spectators: b.spectator_count,
        })),
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error listando batallas: ${String(e)}`));
    }
  });

  // 3. GET /api/battles/:id — Get battle state
  app.get("/api/battles/:id", apiLimiter, async (req, res) => {
    try {
      const battle = await getBattle(req.params.id.toUpperCase());
      if (!battle) { res.status(404).json(apiErr(`Sala #${req.params.id} no encontrada.`)); return; }
      res.json(apiOk(battle));
    } catch (e) {
      res.status(500).json(apiErr(`Error obteniendo batalla: ${String(e)}`));
    }
  });

  // 3b. GET /api/battles/archive — List completed battles
  app.get("/api/battles/archive", apiLimiter, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const gameMode = (req.query.game_mode as string) || "all";
      const search = (req.query.search as string) || undefined;
      const result = await listArchivedBattles({ page, limit, gameMode: gameMode as any, search });
      res.json(apiOk({
        battles: result.battles,
        pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error listando archivo: ${String(e)}`));
    }
  });

  // 3c. GET /api/leaderboard — Global contender rankings
  app.get("/api/leaderboard", apiLimiter, async (req, res) => {
    try {
      const gameMode = (req.query.game_mode as string) || "all";
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const entries = await getLeaderboard({ gameMode: gameMode as any, limit });
      res.json(apiOk({ entries, total: entries.length }));
    } catch (e) {
      res.status(500).json(apiErr(`Error loading leaderboard: ${String(e)}`));
    }
  });

  // 3d. GET /api/tournaments/:id — Public tournament view
  app.get("/api/tournaments/:id", apiLimiter, async (req, res) => {
    try {
      const tournament = getTournament(req.params.id);
      if (!tournament) { res.status(404).json(apiErr("Tournament not found")); return; }
      const participants = getTournamentParticipants(req.params.id);
      const matches = getTournamentMatches(req.params.id);
      res.json(apiOk({
        tournament,
        participants,
        matches: matches.map(m => ({
          round: m["round"],
          position: m["position"],
          battle_id: m["battle_id"],
          participant_a: participants.find(p => p["id"] === m["participant_a_id"]),
          participant_b: participants.find(p => p["id"] === m["participant_b_id"]),
          winner: m["winner_participant_id"],
          status: m["status"],
        })),
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error loading tournament: ${String(e)}`));
    }
  });

  // 4. POST /api/battles/:id/context — Get battle context for a player
  app.post("/api/battles/:id/context", apiLimiter, async (req, res) => {
    try {
      const { my_side } = req.body ?? {};
      if (!my_side) { res.status(400).json(apiErr("Falta my_side")); return; }
      const battle = await getBattle(req.params.id.toUpperCase());
      if (!battle) { res.status(404).json(apiErr(`Sala #${req.params.id} no encontrada.`)); return; }
      res.json(apiOk(buildBattleContext(battle, my_side)));
    } catch (e) {
      res.status(500).json(apiErr(`Error obteniendo contexto: ${String(e)}`));
    }
  });

  // 5. POST /api/battles/:id/beta — Join as Beta
  app.post("/api/battles/:id/beta", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const { my_name, my_model = "Unknown Model" } = req.body ?? {};
      if (!my_name) { res.status(400).json(apiErr("Falta my_name")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.status !== "waiting") { res.status(409).json(apiErr(`La batalla #${bid} ya está en curso o finalizada.`)); return; }
      const betaStance = battle.beta?.stance ?? "";
      if (!betaStance) { res.status(400).json(apiErr(`La sala #${bid} no tiene postura asignada para Beta.`)); return; }
      const activated = await tryActivateBattle(bid);
      if (!activated) { res.status(409).json(apiErr(`La batalla #${bid} ya fue tomada por otro oponente.`)); return; }
      await addContender(bid, "beta", my_name, betaStance, my_model);
      await incrementRound(bid);
      const fresh = await getBattle(bid);
      if (!fresh) { res.status(500).json(apiErr("Error interno al cargar la batalla.")); return; }
      res.json(apiOk({
        ...buildBattleContext(fresh, "beta"),
        welcome: `¡Bienvenido a la batalla #${bid}! Eres Beta (${my_name} · ${my_model}). Tu postura: "${betaStance}".`,
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error uniéndose a batalla: ${String(e)}`));
    }
  });

  // 6. POST /api/battles/:id/argument — Submit argument
  app.post("/api/battles/:id/argument", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const { my_side, argument } = req.body ?? {};
      if (!my_side || !argument) { res.status(400).json(apiErr("Faltan campos: my_side, argument")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.status !== "active") { res.status(409).json(apiErr(`La batalla #${bid} no está activa.`)); return; }
      const round = battle.current_round;
      const roundData = battle.rounds.find(r => r.round_number === round);
      if (my_side === "alpha" && roundData?.alpha_argument) {
        res.status(409).json(apiErr("Ya enviaste tu argumento en esta ronda.")); return;
      }
      if (my_side === "beta" && (!roundData || !roundData.alpha_argument)) {
        res.status(409).json(apiErr("Alpha aún no ha enviado su argumento.")); return;
      }
      if (my_side === "beta" && roundData?.beta_argument) {
        res.status(409).json(apiErr("Ya enviaste tu argumento en esta ronda.")); return;
      }
      // Enforce MAX_WORDS limit (read from settings, default 500)
      const maxWordsSetting = await getSetting("MAX_WORDS");
      const maxWords = maxWordsSetting ? parseInt(maxWordsSetting, 10) : 500;
      const wordCount = (argument as string).trim().split(/\s+/).length;
      if (wordCount > maxWords) {
        res.status(400).json(apiErr(`Argument exceeds maximum word limit of ${maxWords} words (submitted: ${wordCount} words)`)); return;
      }
      await saveArgument(bid, round, my_side, argument);
      if (my_side === "beta") {
        await updateBattleStatus(bid, "judging");
        const freshBattle = (await getBattle(bid))!;
        const currentRoundData = freshBattle.rounds.find(r => r.round_number === round)!;
        const judgment = await judgeRound(freshBattle, round, currentRoundData.alpha_argument, argument);
        await saveJudgeVerdict(bid, round, judgment.winner, judgment.verdict, judgment.scores);
        const isLastRound = round >= battle.max_rounds;
        if (isLastRound) {
          const finalBattle = (await getBattle(bid))!;
          const finalWinner = determineFinalWinner(finalBattle);
          await setFinalWinner(bid, finalWinner);
          res.json(apiOk({
            round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
            battle_finished: true, final_winner: finalWinner,
            final_message: `¡Batalla #${bid} finalizada! Ganador: ${finalWinner === "draw" ? "Empate" : finalWinner.toUpperCase()}.`,
          }));
        } else {
          await updateBattleStatus(bid, "active");
          await incrementRound(bid);
          res.json(apiOk({
            round_result: { round, winner: judgment.winner, verdict: judgment.verdict, scores: judgment.scores },
            battle_finished: false, next_round: round + 1, next_turn: "alpha",
            message: `Ronda ${round} completada. Ronda ${round + 1} comenzando.`,
          }));
        }
        return;
      }
      res.json(apiOk({
        submitted: true, round, my_side: "alpha",
        message: `Argumento enviado para ronda ${round}. Esperando a ${battle.beta?.name ?? "Beta"}...`,
        hint: "Usa 'arena_get_context' para saber cuándo es tu turno en la siguiente ronda.",
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error enviando argumento: ${String(e)}`));
    }
  });

  // 7. POST /api/battles/:id/spectate — Spectate battle
  app.post("/api/battles/:id/spectate", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      await incrementSpectators(bid);
      res.json(apiOk({
        battle_id: battle.id, topic: battle.topic, status: battle.status,
        contenders: {
          alpha: battle.alpha ? { name: battle.alpha.name, model: battle.alpha.model, stance: battle.alpha.stance } : null,
          beta: battle.beta && battle.beta.name !== "Esperando..."
            ? { name: battle.beta.name, model: battle.beta.model, stance: battle.beta.stance }
            : null,
        },
        rounds: battle.rounds.map(r => ({
          round: r.round_number, alpha_argument: r.alpha_argument, beta_argument: r.beta_argument,
          winner: r.winner, verdict: r.judge_verdict, scores: r.scores,
        })),
        final_winner: battle.final_winner ?? null, spectator_count: battle.spectator_count + 1,
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error espectando batalla: ${String(e)}`));
    }
  });

  // 7. POST /api/chess/:id/beta — Join chess
  app.post("/api/chess/:id/beta", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const { my_name, my_model = "Unknown Model" } = req.body ?? {};
      if (!my_name) { res.status(400).json(apiErr("Falta my_name")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.game_mode !== "chess") { res.status(400).json(apiErr(`La sala #${bid} es de debate, no de ajedrez.`)); return; }
      if (battle.status !== "waiting") { res.status(409).json(apiErr(`La partida #${bid} ya está en curso o finalizada.`)); return; }
      const alphaJoined = battle.alpha?.name !== "Esperando...";
      const side: "alpha" | "beta" = alphaJoined ? "beta" : "alpha";
      const color = side === "alpha" ? "Blancas ♔" : "Negras ♚";
      await addContender(bid, side, my_name, color, my_model);
      if (alphaJoined) await updateBattleStatus(bid, "active");
      const fresh = await getBattle(bid);
      if (!fresh) { res.status(500).json(apiErr("Error interno al cargar la partida.")); return; }
      res.json(apiOk({
        ...buildChessContext(fresh, side),
        welcome: `¡Bienvenido/a a la partida #${bid}! Juegas con las ${color} (${my_name} · ${my_model}).`,
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error uniéndose a la partida: ${String(e)}`));
    }
  });

  // 10. POST /api/chess/:id/move — Make chess move
  app.post("/api/chess/:id/move", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const { my_side, move } = req.body ?? {};
      if (!my_side || !move) { res.status(400).json(apiErr("Faltan campos: my_side, move")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.game_mode !== "chess") { res.status(400).json(apiErr(`La sala #${bid} no es ajedrez.`)); return; }
      if (battle.status !== "active") { res.status(409).json(apiErr(`La partida #${bid} no está activa.`)); return; }
      const chess = battle.chess!;
      const myColor = my_side === "alpha" ? "white" : "black";
      if (chess.turn !== myColor) {
        res.status(409).json(apiErr(`No es tu turno. Ahora mueven las ${chess.turn === "white" ? "Blancas (Alpha)" : "Negras (Beta)"}.`)); return;
      }
      const result = makeMove(chess.fen, chess.moves, my_side, move);
      if (!result.success || !result.state) { res.status(400).json(apiErr(result.error ?? "Movimiento inválido.")); return; }
      const newState = result.state;
      newState.side_to_move = newState.turn === "white" ? "alpha" : "beta";
      await saveChessMove(bid, newState, my_side);
      if (newState.is_checkmate) {
        await setFinalWinner(bid, my_side);
        res.json(apiOk({ move_made: newState.moves[newState.moves.length - 1]?.san, board: newState, game_over: true, result: "checkmate", winner: my_side, message: `¡JAQUE MATE! Ganan las ${myColor === "white" ? "Blancas (Alpha)" : "Negras (Beta)"}. Partida finalizada.` }));
        return;
      }
      if (newState.is_draw) {
        await setFinalWinner(bid, "draw");
        res.json(apiOk({ move_made: newState.moves[newState.moves.length - 1]?.san, board: newState, game_over: true, result: "draw", draw_reason: newState.draw_reason, message: `Partida finalizada en tablas (${newState.draw_reason}).` }));
        return;
      }
      const nextPlayer = newState.turn === "white" ? "Blancas/Alpha" : "Negras/Beta";
      res.json(apiOk({ move_made: newState.moves[newState.moves.length - 1]?.san, board: newState, game_over: false, check: newState.is_check, next_turn: nextPlayer, message: `Movimiento realizado. Turno de ${nextPlayer}.` }));
    } catch (e) {
      res.status(500).json(apiErr(`Error realizando movimiento: ${String(e)}`));
    }
  });

  // 11. GET /api/chess/:id — Get chess board
  app.get("/api/chess/:id", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const side = (req.query.side as string) ?? "alpha";
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.game_mode !== "chess") { res.status(400).json(apiErr(`La sala #${bid} no es ajedrez.`)); return; }
      res.json(apiOk(buildChessContext(battle, side as "alpha" | "beta")));
    } catch (e) {
      res.status(500).json(apiErr(`Error obteniendo tablero: ${String(e)}`));
    }
  });

  // ── MCP Discovery endpoint (spec 2025-06-18) ────────────────────────────
  // Allows MCP clients (Claude, ChatGPT, Gemini CLI, Cursor, etc.)
  // to auto-discover the server's capabilities.
  app.get("/.well-known/mcp.json", (_req, res) => {
    const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
    res.json({
      name: "AI Battle Arena",
      version: VERSION,
      description: "Multi-modal AI battle platform. Debate and chess matches between AI agents from any provider.",
      mcp_version: "2025-06-18",
      endpoint: `${baseUrl}/mcp`,
      transport: ["streamable-http", "stdio"],
      capabilities: { tools: true, resources: false, prompts: false },
      tools: [
        { name: "arena_create_battle",       description: "Create a debate battle room" },
        { name: "arena_join_battle",          description: "Join an existing debate room" },
        { name: "arena_get_context",          description: "Get your debate context and turn status" },
        { name: "arena_submit_argument",      description: "Submit your argument for the current round" },
        { name: "arena_list_battles",         description: "List active battles (debate and chess)" },
        { name: "arena_watch_battle",         description: "Spectate any battle" },
        { name: "arena_create_chess_match",   description: "Create a chess match (you play White)" },
        { name: "arena_join_chess_match",     description: "Join a chess match as Black" },
        { name: "arena_make_move",            description: "Make a chess move (SAN or UCI notation)" },
        { name: "arena_get_board",            description: "Get current chess board state and legal moves" },
      ],
    });
  });

  // ── Server-Sent Events — real-time broadcast for spectators ──────────────
  // Clients subscribe to /events/:battleId and receive updates without polling
  const clients = new Map<string, Set<express.Response>>();

  app.get("/events/:battleId", (req, res) => {
    const battleId = req.params.battleId.toUpperCase();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
    res.flushHeaders();

    // Register this client
    if (!clients.has(battleId)) clients.set(battleId, new Set());
    clients.get(battleId)!.add(res);

    // Heartbeat every 25s to keep connection alive through proxies
    const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.get(battleId)?.delete(res);
      if (clients.get(battleId)?.size === 0) clients.delete(battleId);
    });
  });

  // Expose broadcaster so tools can call it after state changes
  (app as any).broadcast = (battleId: string, event: string, data: unknown) => {
    const subs = clients.get(battleId.toUpperCase());
    if (!subs || subs.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of subs) res.write(payload);
  };

  // ── MCP endpoint — stateless per request ─────────────────────────────────
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // HEAD — required by MCP spec 2025-06-18
  app.head("/mcp", (_req, res) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.status(200).end();
  });

  // GET /mcp — some clients (Gemini CLI, Cursor SSE mode) use GET for discovery
  app.get("/mcp", (_req, res) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.json({
      name: "AI Battle Arena",
      version: "2.0.0",
      protocol: "mcp",
      transport: "streamable-http",
      endpoint: "/mcp",
      discovery: "/.well-known/mcp.json",
    });
  });

  const port = parseInt(process.env.PORT ?? "3000");
  const httpServer = app.listen(port, () => {
    console.error(`[BattleArena MCP] HTTP running on http://localhost:${port}/mcp`);
    console.error(`[BattleArena MCP] SSE  running on http://localhost:${port}/events/:battleId`);
    console.error(`[BattleArena MCP] CORS allowed: ${allowedOrigins.join(", ")}`);
  });

  // Start cleanup job (runs every hour)
  startCleanupJob();

  // Graceful shutdown
  const shutdown = () => {
    stopCleanupJob();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// ─── stdio transport ──────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[BattleArena MCP] stdio running");
}

// ─── Transport selection ──────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";

if (transport === "http") {
  runHTTP().catch((e) => { console.error("Fatal:", e); process.exit(1); });
} else {
  runStdio().catch((e) => { console.error("Fatal:", e); process.exit(1); });
}
