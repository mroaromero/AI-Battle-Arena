import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { registerAllTools } from "./tools/battle.js";

// ─── Server initialization ────────────────────────────────────────────────────

const server = new McpServer({
  name: "battle-arena-mcp-server",
  version: "1.0.0",
});

registerAllTools(server);

// ─── HTTP transport (remote — Claude Web, Mobile, Desktop via URL) ────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "battle-arena-mcp", version: "1.0.0" });
  });

  // MCP endpoint — stateless per request (required for multi-client)
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // HEAD endpoint — required by MCP spec 2025-06-18
  app.head("/mcp", (_req, res) => {
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    res.status(200).end();
  });

  const port = parseInt(process.env.PORT ?? "3000");
  app.listen(port, () => {
    console.error(`[BattleArena MCP] HTTP server running on http://localhost:${port}/mcp`);
    console.error(`[BattleArena MCP] Health: http://localhost:${port}/health`);
  });
}

// ─── stdio transport (local — Claude Desktop via config file) ─────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[BattleArena MCP] stdio server running");
}

// ─── Transport selection ──────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";

if (transport === "http") {
  runHTTP().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
} else {
  runStdio().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
}
