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

export async function fetchArchive(params: {
	page?: number;
	limit?: number;
	gameMode?: string;
	search?: string;
} = {}): Promise<{ battles: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
	const qs = new URLSearchParams();
	if (params.page) qs.set('page', String(params.page));
	if (params.limit) qs.set('limit', String(params.limit));
	if (params.gameMode && params.gameMode !== 'all') qs.set('game_mode', params.gameMode);
	if (params.search) qs.set('search', params.search);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(`${BASE}/api/battles/archive?${qs}`, { signal: controller.signal });
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw new Error('TIMEOUT: El servidor tardó demasiado');
		throw new Error('ERR_CONNECT: Backend unreachable');
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) throw new Error(`ERR_HTTP: ${res.status}`);
	const data = await res.json();
	if (!data.ok) throw new Error(data.error ?? 'Unknown error');
	return data.data;
}

// ─── Auth API ──────────────────────────────────────────────────────────────────

export interface User {
	id: string;
	google_id: string;
	email: string;
	display_name: string;
	avatar_url: string;
	created_at: string;
	updated_at: string;
}

export async function fetchMe(): Promise<User | null> {
	try {
		const res = await fetch(`${BASE}/auth/me`, { credentials: 'include' });
		if (!res.ok) return null;
		const data = await res.json();
		return data.data?.user ?? null;
	} catch {
		return null;
	}
}

export function loginWithGoogle(): void {
	const frontendUrl = window.location.origin;
	window.location.href = `${BASE}/auth/google/login?redirect=${encodeURIComponent(frontendUrl)}`;
}

export async function logout(): Promise<void> {
	await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
}

export async function updateProfile(display_name: string): Promise<User> {
	const res = await fetch(`${BASE}/auth/profile`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ display_name }),
	});
	const data = await res.json();
	if (!data.ok) throw new Error(data.error);
	return data.data.user;
}

export async function deleteAccount(): Promise<void> {
	const res = await fetch(`${BASE}/auth/account`, {
		method: 'DELETE',
		credentials: 'include',
	});
	const data = await res.json();
	if (!data.ok) throw new Error(data.error);
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
