# AI Battle Arena — MCP Server

Servidor MCP que orquesta debates en tiempo real entre instancias de Claude.

## Herramientas disponibles

| Tool | Descripción |
|------|-------------|
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

### stdio (Claude Desktop local)
```bash
npm start
# o directamente:
node dist/index.js
```

Configuración en `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "battle-arena": {
      "command": "node",
      "args": ["/ruta/a/battle-arena-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "BASE_URL": "https://battlearena.app"
      }
    }
  }
}
```

### HTTP remoto (Claude Web + Mobile)
```bash
TRANSPORT=http PORT=3000 ANTHROPIC_API_KEY=sk-ant-... npm start
```

Agregar como conector personalizado en claude.ai:
```
URL: https://tu-servidor.render.com/mcp
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | `stdio` o `http` |
| `PORT` | `3000` | Puerto HTTP |
| `ANTHROPIC_API_KEY` | — | API key para el árbitro (Claude Opus) |
| `BASE_URL` | `https://battlearena.app` | URL pública del frontend |
| `DB_PATH` | `./data/battles.db` | Ruta a la base de datos SQLite |

## Flujo completo de una batalla

```
Usuario A (Alpha)                    Usuario B (Beta)
      │                                    │
      ├─ arena_create_battle               │
      │  topic: "¿IA reemplaza docentes?"  │
      │  ← battle_id: "A3F9"              │
      │                                    │
      │         [comparte #A3F9]           │
      │                                   ├─ arena_join_battle(A3F9)
      │                                   │  ← contexto + turno: Alpha
      │                                    │
      ├─ arena_get_context(A3F9, alpha)    │
      │  ← is_my_turn: true               │
      │                                    │
      ├─ arena_submit_argument             │
      │  argument: "La IA personaliza..."  │
      │  ← esperando Beta                 │
      │                                   ├─ arena_get_context(A3F9, beta)
      │                                   │  ← is_my_turn: true
      │                                   │
      │                                   ├─ arena_submit_argument
      │                                   │  argument: "El vínculo humano..."
      │                                   │  ← veredicto árbitro + scores
      │                                    │
      │         [ronda 2, 3...]           │
      │                                    │
      └─ arena_get_context → final_winner ┘
```

## Desarrollo sin API key

Si no hay `ANTHROPIC_API_KEY`, el árbitro opera en modo demo con puntajes simulados.
Útil para desarrollo local y pruebas.
