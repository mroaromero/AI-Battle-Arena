import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerAllTools } from "./tools/battle.js";
import { startCleanupJob, stopCleanupJob } from "./services/cleanup.js";
import {
  getAllSettings, setSetting, getBattleStats,
  createBattle, getBattle, addContender, updateBattleStatus,
  listActiveBattles, saveArgument, saveJudgeVerdict,
  setFinalWinner, incrementRound, incrementSpectators,
  tryActivateBattle, saveChessMove,
} from "./services/db.js";
import { judgeRound } from "./services/judge.js";
import { createInitialChessState, makeMove } from "./services/chess-engine.js";
import {
  generateBattleId, buildBattleContext, buildChessContext,
  determineFinalWinner, ok as apiOk, err as apiErr,
} from "./services/utils.js";

// ─── Server initialization ────────────────────────────────────────────────────

const VERSION = "2.0.0";

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

  // ── Health check ─────────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "battle-arena-mcp", version: VERSION });
  });

  // ── Admin rate limiter — brute-force protection ───────────────────────────────
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max: 20,               // 20 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, slow down." },
  });

  // ── Admin API ────────────────────────────────────────────────────────────────────
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;
    
    if (!adminSecret) {
      // We must explicitly `return` so TypeScript knows we end execution here for this route.
      res.status(500).json({ error: "ADMIN_SECRET not configured on server" });
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
    const settings = await getAllSettings();
    // Mask API keys so they are not exposed in plaintext over the wire
    const maskedSettings = { ...settings };
    const maskKey = (key: string) => {
      if (maskedSettings[key] && maskedSettings[key].length > 8) {
        maskedSettings[key] = maskedSettings[key].substring(0, 8) + "...****";
      }
    };
    maskKey("ANTHROPIC_API_KEY");
    maskKey("OPENROUTER_API_KEY");
    maskKey("GROQ_API_KEY");
    
    res.json(maskedSettings);
  });

  app.post("/admin/config", adminLimiter, adminAuth, async (req, res) => {
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

  // ── Public REST API — consumed by public-mcp service ─────────────────────
  // No auth required: server-to-server calls from public-mcp (no origin header)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests." },
  });

  // 1. POST /api/battles — Create debate battle
  app.post("/api/battles", apiLimiter, async (req, res) => {
    try {
      const { topic, alpha_stance, beta_stance, my_name, my_device = "AI Desktop", max_rounds = 3 } = req.body ?? {};
      if (!topic || !alpha_stance || !beta_stance || !my_name) {
        res.status(400).json(apiErr("Faltan campos requeridos: topic, alpha_stance, beta_stance, my_name"));
        return;
      }
      const id = generateBattleId();
      await createBattle(id, topic, max_rounds);
      await addContender(id, "alpha", my_name, alpha_stance, my_device);
      await addContender(id, "beta", "TBD", beta_stance, "");
      const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
      res.json(apiOk({
        battle_id: id,
        join_url: `${baseUrl}/live/${id}`,
        my_side: "alpha",
        share_message: `¡Te desafío a un debate en AI Battle Arena! Código: #${id} — Tema: "${topic}". Únete en ${baseUrl}`,
        instructions: `Sala #${id} creada. Comparte el código. Una vez que Beta se una usa 'arena_get_context' para comenzar.`,
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error creando batalla: ${String(e)}`));
    }
  });

  // 2. GET /api/battles — List active battles
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
          alpha: b.alpha?.name ?? "Esperando...",
          beta: b.beta?.name === "TBD" ? "Buscando oponente..." : (b.beta?.name ?? "Buscando oponente..."),
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
      const { my_name, my_device = "AI Web" } = req.body ?? {};
      if (!my_name) { res.status(400).json(apiErr("Falta my_name")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.status !== "waiting") { res.status(409).json(apiErr(`La batalla #${bid} ya está en curso o finalizada.`)); return; }
      const betaStance = battle.beta?.stance ?? "";
      if (!betaStance) { res.status(400).json(apiErr(`La sala #${bid} no tiene postura asignada para Beta.`)); return; }
      const activated = await tryActivateBattle(bid);
      if (!activated) { res.status(409).json(apiErr(`La batalla #${bid} ya fue tomada por otro oponente.`)); return; }
      await addContender(bid, "beta", my_name, betaStance, my_device);
      await incrementRound(bid);
      const fresh = await getBattle(bid);
      if (!fresh) { res.status(500).json(apiErr("Error interno al cargar la batalla.")); return; }
      res.json(apiOk({
        ...buildBattleContext(fresh, "beta"),
        welcome: `¡Bienvenido a la batalla #${bid}! Eres Beta. Tu postura: "${betaStance}". ${fresh.alpha?.name ?? "Alpha"} argumenta primero.`,
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
          alpha: battle.alpha ? { name: battle.alpha.name, stance: battle.alpha.stance } : null,
          beta: battle.beta && battle.beta.name !== "TBD" ? { name: battle.beta.name, stance: battle.beta.stance } : null,
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

  // 8. POST /api/chess — Create chess match
  app.post("/api/chess", apiLimiter, async (req, res) => {
    try {
      const { my_name, my_device = "AI Desktop" } = req.body ?? {};
      if (!my_name) { res.status(400).json(apiErr("Falta my_name")); return; }
      const id = generateBattleId();
      await createBattle(id, "Partida de Ajedrez", 999, "chess");
      await addContender(id, "alpha", my_name, "Blancas ♔", my_device);
      await addContender(id, "beta", "TBD", "Negras ♚", "");
      const initialState = createInitialChessState();
      await saveChessMove(id, initialState, null);
      const baseUrl = process.env.BASE_URL ?? "https://battlearena.app";
      res.json(apiOk({
        battle_id: id, my_color: "white", join_url: `${baseUrl}/chess/${id}`,
        share_message: `¡Te desafío a una partida de ajedrez en AI Battle Arena! Código: #${id}. Únete en ${baseUrl}`,
        instructions: `Sala #${id} creada. Juegas con las Blancas ♔. Comparte el código.`,
      }));
    } catch (e) {
      res.status(500).json(apiErr(`Error creando partida: ${String(e)}`));
    }
  });

  // 9. POST /api/chess/:id/beta — Join chess as Black
  app.post("/api/chess/:id/beta", apiLimiter, async (req, res) => {
    try {
      const bid = req.params.id.toUpperCase();
      const { my_name, my_device = "AI Web" } = req.body ?? {};
      if (!my_name) { res.status(400).json(apiErr("Falta my_name")); return; }
      const battle = await getBattle(bid);
      if (!battle) { res.status(404).json(apiErr(`Sala #${bid} no encontrada.`)); return; }
      if (battle.game_mode !== "chess") { res.status(400).json(apiErr(`La sala #${bid} es de debate, no de ajedrez.`)); return; }
      if (battle.status !== "waiting") { res.status(409).json(apiErr(`La partida #${bid} ya está en curso o finalizada.`)); return; }
      await addContender(bid, "beta", my_name, "Negras ♚", my_device);
      await updateBattleStatus(bid, "active");
      const fresh = await getBattle(bid);
      if (!fresh) { res.status(500).json(apiErr("Error interno al cargar la partida.")); return; }
      res.json(apiOk({
        ...buildChessContext(fresh, "beta"),
        welcome: `¡Bienvenido/a a la partida #${bid}! Juegas con las Negras ♚. ${fresh.alpha?.name ?? "Blancas"} comienzan.`,
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
