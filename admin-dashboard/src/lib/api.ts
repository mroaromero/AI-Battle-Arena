const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export type ApiOk<T>  = { data: T;    error: null };
export type ApiErr    = { data: null; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function request<T>(
  path: string,
  secret: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) return { data: null, error: 'ERR_AUTH' };
    if (res.status === 429) return { data: null, error: 'ERR_RATE_LIMIT' };
    if (!res.ok)            return { data: null, error: `ERR_${res.status}` };
    return { data: await res.json() as T, error: null };
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') return { data: null, error: 'ERR_TIMEOUT' };
    return { data: null, error: 'ERR_NETWORK' };
  }
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type AdminStatus = {
  online:  boolean;
  version: string;
  uptime:  number;
  battles: { total: number; waiting: number; active: number; completed: number };
};

export type ModelOption = { id: string; name: string };
export type ModelsResponse = Record<string, ModelOption[]>;

export type BattleRoom = {
  id: string;
  topic: string;
  game_mode: 'debate' | 'chess';
  status: string;
  max_rounds: number;
  alpha_name: string | null;
  beta_name: string | null;
  alpha_model: string | null;
  beta_model: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  final_winner: string | null;
};

// ─── API client ──────────────────────────────────────────────────────────────

export const api = {
  getStatus: (secret: string) =>
    request<AdminStatus>('/admin/status', secret),

  getConfig: (secret: string) =>
    request<Record<string, string>>('/admin/config', secret),

  saveConfig: (secret: string, body: Record<string, string>) =>
    request<{ success: true }>('/admin/config', secret, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRooms: (secret: string) =>
    request<{ rooms: BattleRoom[]; total: number }>('/admin/rooms', secret),

  createRooms: (secret: string, body: {
    count: number;
    topic: string;
    alpha_stance: string;
    beta_stance: string;
    game_mode: 'debate' | 'chess';
    max_rounds: number;
  }) =>
    request<{ created: number; rooms: { battle_id: string; join_url: string }[] }>('/admin/rooms', secret, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteRoom: (secret: string, battleId: string) =>
    request<{ deleted: boolean }>('/admin/rooms/' + battleId, secret, {
      method: 'DELETE',
    }),

  getTournaments: (secret: string) =>
    request<{ tournaments: any[]; total: number }>('/admin/tournaments', secret),

  getTournament: (secret: string, id: string) =>
    request<{ tournament: any; participants: any[]; matches: any[] }>('/admin/tournaments/' + id, secret),

  createTournament: (secret: string, body: {
    name: string;
    topic: string;
    game_mode: 'debate' | 'chess';
    bracket_type: 'single_elimination' | 'round_robin';
    max_participants: number;
    participants: { name: string; model: string }[];
    debate_config?: any;
  }) =>
    request<{ tournament_id: string; bracket_url: string; participants: number; first_round_matches: number }>('/admin/tournaments', secret, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteTournament: (secret: string, id: string) =>
    request<{ deleted: boolean }>('/admin/tournaments/' + id, secret, {
      method: 'DELETE',
    }),

  getModels: () =>
    fetch(`${API_URL}/admin/models`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data ? { data: data as ModelsResponse } : { error: 'ERR_MODELS' })
      .catch(() => ({ error: 'ERR_NETWORK' })) as Promise<{ data?: ModelsResponse; error?: string }>,

  getProvidersStatus: (secret: string) =>
    request<{ providers: Record<string, { connected: boolean; method: string; setupUrl: string }> }>('/admin/providers/status', secret),

  testProvider: (secret: string, provider: string) =>
    request<{ success: boolean; error: string | null }>('/admin/providers/test', secret, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),
};
