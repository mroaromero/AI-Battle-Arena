// ─── API client — talks to the MCP HTTP server ───────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function callTool(tool: string, input: Record<string, unknown> = {}) {
	const res = await fetch(`${BASE}/mcp`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: Date.now(),
			method: 'tools/call',
			params: { name: tool, arguments: input }
		})
	});
	if (!res.ok) throw new Error(`API error ${res.status}`);
	const data = await res.json();
	const text = data?.result?.content?.[0]?.text ?? '{}';
	const parsed = JSON.parse(text);
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
