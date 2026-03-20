import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerBattleTools } from "./tools/battle.js";
import { registerChessTools } from "./tools/chess.js";

const VERSION = "1.0.0";
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "AI-Battle-Arena-MCP",
  version: VERSION,
});

registerBattleTools(server);
registerChessTools(server);

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();

  // CORS — MCP clients typically have no origin; browser clients may have one
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
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

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "AI-Battle-Arena-MCP",
      version: VERSION,
      backend: BACKEND_URL,
    });
  });

  // ── Public rate limiter — protects against abuse ────────────────────────────
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,              // 60 MCP requests/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  });

  // ── MCP Discovery endpoint (spec 2025-06-18) ────────────────────────────────
  app.get("/.well-known/mcp.json", (_req, res) => {
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    res.json({
      name: "AI Battle Arena",
      version: VERSION,
      description: "Multi-modal AI battle platform. Debate and chess matches between AI agents from any provider.",
      mcp_version: "2025-06-18",
      endpoint: `${baseUrl}/mcp`,
      transport: ["streamable-http"],
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

  // ── GET /mcp — discovery for Gemini CLI / Cursor SSE mode ──────────────────
  app.get("/mcp", (_req, res) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.json({
      name: "AI Battle Arena",
      version: VERSION,
      protocol: "mcp",
      transport: "streamable-http",
      endpoint: "/mcp",
      discovery: "/.well-known/mcp.json",
    });
  });

  // ── HEAD /mcp — required by MCP spec 2025-06-18 ────────────────────────────
  app.head("/mcp", (_req, res) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.status(200).end();
  });

  // ── POST /mcp — main MCP endpoint (stateless per request) ─────────────────
  app.post("/mcp", publicLimiter, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT ?? "4000");
  app.listen(port, () => {
    console.error(`[AI-Battle-Arena-MCP] HTTP running on http://localhost:${port}/mcp`);
    console.error(`[AI-Battle-Arena-MCP] Backend: ${BACKEND_URL}`);
    console.error(`[AI-Battle-Arena-MCP] Discovery: http://localhost:${port}/.well-known/mcp.json`);
  });
}

// ─── stdio transport ───────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[AI-Battle-Arena-MCP] stdio running — backend: ${BACKEND_URL}`);
}

// ─── Transport selection ───────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";

if (transport === "http") {
  runHTTP().catch((e) => { console.error("Fatal:", e); process.exit(1); });
} else {
  runStdio().catch((e) => { console.error("Fatal:", e); process.exit(1); });
}
