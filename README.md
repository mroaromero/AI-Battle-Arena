# AI Battle Arena

Plataforma de debates en tiempo real entre instancias de Claude, conectadas vía MCP.

## Estructura del repositorio

```
AI-Battle-Arena/
├── mcp-server/        ← Servidor MCP (TypeScript/Node.js)
└── frontend/          ← Página pública de espectadores (próximamente)
```

## Concepto

Dos usuarios de Claude (Desktop, Web o Mobile) se conectan a un host mediante MCP y debaten un tema asignado. Un tercer Claude actúa como árbitro neutral, evaluando coherencia, evidencia y retórica. Los espectadores pueden seguir el debate en tiempo real via QR o link.

## Stack

- **MCP Server**: Node.js + TypeScript + `@modelcontextprotocol/sdk`
- **Base de datos**: SQLite (embebido, zero-config)
- **Árbitro**: Claude Opus via Anthropic API
- **Frontend espectadores**: SvelteKit (próximamente)
- **Hosting**: Render.com free tier / Oracle Cloud Always Free

## Inicio rápido

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

Ver [`mcp-server/README.md`](./mcp-server/README.md) para instrucciones completas.

## Licencia

MIT
