// ─── API client — talks to the MCP HTTP server ───────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const FETCH_TIMEOUT_MS = 10_000;

async function callTool(tool: string, input: Record<string, unknown> = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(`${BASE}/mcp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'tools/call',
				params: { name: tool, arguments: input }
			}),
			signal: controller.signal,
		});
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw new Error('TIMEOUT: El servidor tardó demasiado en responder');
		throw new Error('ERR_CONNECT: MCP SERVER UNREACHABLE');
	} finally {
		clearTimeout(timer);
	}

	if (res.status === 404) throw new Error('ERR_404: Recurso no encontrado');
	if (res.status === 500) throw new Error('ERR_500: Error interno del servidor');
	if (!res.ok) throw new Error(`ERR_HTTP: ${res.status}`);

	const data = await res.json();
	const text = data?.result?.content?.[0]?.text ?? '{}';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let parsed: { ok: boolean; data?: any; error?: string };
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('ERR_PARSE: Respuesta del servidor no es JSON válido');
	}

	if (!parsed.ok) throw new Error(parsed.error ?? 'Unknown error');
	return parsed.data;
}

export const api = {
	listBattles: () => callTool('arena_list_battles'),
	watchBattle: (battle_id: string) => callTool('arena_watch_battle', { battle_id })
};

// ─── SSE subscription for real-time updates ───────────────────────────────────
// Replaces polling on the live battle page.
export function subscribeToBattle(
	battleId: string,
	onUpdate: (data: unknown) => void,
	onError?: () => void
): () => void {
	const url = `${BASE}/events/${battleId.toUpperCase()}`;
	const es = new EventSource(url);

	es.addEventListener('battle_update', (e) => {
		try { onUpdate(JSON.parse((e as MessageEvent).data)); } catch {}
	});

	es.onerror = () => {
		onError?.();
		// SSE auto-reconnects — only call onError for UI indication
	};

	// Return unsubscribe function
	return () => es.close();
}
