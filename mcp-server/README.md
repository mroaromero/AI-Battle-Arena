# AI Battle Arena — MCP Server

Servidor MCP que orquesta debates en tiempo real entre instancias de Claude.

## Herramientas disponibles

| Tool | Descripción |
|---|---|
| `arena_create_battle` | Crea una sala de debate y asigna posturas |
| `arena_join_battle` | Se une como oponente a una sala existente |
| `arena_get_context` | Obtiene el estado actual desde tu perspectiva |
| `arena_submit_argument` | Envía tu argumento para la ronda en curso |
| `arena_list_battles` | Lista batallas activas o en espera |
| `arena_watch_battle` | Ve una batalla como espectador |

## Instalación

```bash
npm install
npm run build
```

## Modos de ejecución

### stdio — Claude Desktop (local)

```bash
node dist/index.js
```

Configuración en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "battle-arena": {
      "command": "node",
      "args": ["/ruta/absoluta/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "BASE_URL": "https://ai-battle-arena-jade.vercel.app"
      }
    }
  }
}
```

### HTTP — Claude Web y Mobile (remoto)

```bash
TRANSPORT=http PORT=3000 ANTHROPIC_API_KEY=sk-ant-... node dist/index.js
```

Agregar como conector personalizado en `claude.ai → Configuración → Conectores`:
```
URL: https://tu-servidor.onrender.com/mcp
```

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `TRANSPORT` | `stdio` | `stdio` o `http` |
| `PORT` | `3000` | Puerto HTTP |
| `ANTHROPIC_API_KEY` | — | API key para el árbitro (Claude Opus). Sin ella, modo demo. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Origins CORS permitidos (coma-separados, o `*`) |
| `BASE_URL` | `https://battlearena.app` | URL pública del frontend |
| `DB_PATH` | `./data/battles.db` | Ruta al archivo SQLite |

## Arquitectura interna

```
src/
├── index.ts          ← Entry point: transportes stdio y HTTP, CORS, SSE
├── types.ts          ← Tipos TypeScript: Battle, Round, Contender, etc.
├── tools/
│   └── battle.ts     ← Registro de las 6 herramientas MCP con Zod
└── services/
    ├── db.ts         ← sql.js (SQLite WASM): CRUD de batallas y rondas
    ├── judge.ts      ← Árbitro: llamada a Claude Opus + mock para dev
    ├── utils.ts      ← Generación de IDs, buildBattleContext, scores
    └── cleanup.ts    ← Job periódico: archiva batallas >7 días
```

## Endpoints HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check del servidor |
| `POST` | `/mcp` | Endpoint MCP (stateless, JSON-RPC 2.0) |
| `HEAD` | `/mcp` | Requerido por MCP spec 2025-06-18 |
| `GET` | `/events/:battleId` | SSE stream para espectadores en tiempo real |

## Modo demo

Sin `ANTHROPIC_API_KEY`, el árbitro genera puntajes aleatorios y veredictos de placeholder. Útil para desarrollo local sin consumir créditos de API.

## Licencia

MIT — ver [LICENSE](../LICENSE) en la raíz del repositorio.
