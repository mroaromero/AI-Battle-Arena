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
};
