import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import cors from "cors";
import { registerAllTools } from "./tools/battle.js";
import { startCleanupJob } from "./services/cleanup.js";

// ─── Server initialization ────────────────────────────────────────────────────

const server = new McpServer({
  name: "battle-arena-mcp-server",
  version: "1.0.0",
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

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "battle-arena-mcp", version: "1.0.0" });
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

  const port = parseInt(process.env.PORT ?? "3000");
  const httpServer = app.listen(port, () => {
    console.error(`[BattleArena MCP] HTTP running on http://localhost:${port}/mcp`);
    console.error(`[BattleArena MCP] SSE  running on http://localhost:${port}/events/:battleId`);
    console.error(`[BattleArena MCP] CORS allowed: ${allowedOrigins.join(", ")}`);
  });

  // Start cleanup job (runs every hour)
  startCleanupJob();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    httpServer.close(() => process.exit(0));
  });
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
