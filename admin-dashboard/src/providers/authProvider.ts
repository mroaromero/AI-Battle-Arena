const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Token TTL: 24 horas. Al expirar se fuerza re-login.
const TOKEN_TTL = 24 * 60 * 60 * 1000;
const EXPIRES_KEY = "admin_secret_expires";

// Cache para evitar llamadas al servidor en cada navegación
let _checkCache = { valid: false, ts: 0 };
const CHECK_CACHE_TTL = 30_000; // 30 segundos

function clearSession() {
  localStorage.removeItem("admin_secret");
  localStorage.removeItem(EXPIRES_KEY);
  _checkCache = { valid: false, ts: 0 };
}

function isTokenExpired(): boolean {
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!expires) return true;
  return Date.now() > parseInt(expires, 10);
}

export const authProvider = {
  login: async ({ secret }: { secret: string }) => {
    try {
      const response = await fetch(`${API_URL}/admin/config`, {
        headers: { 'Authorization': `Bearer ${secret}` }
      });
      if (response.ok) {
        localStorage.setItem("admin_secret", secret);
        localStorage.setItem(EXPIRES_KEY, String(Date.now() + TOKEN_TTL));
        _checkCache = { valid: true, ts: Date.now() };
        return { success: true, redirectTo: "/" };
      }
      if (response.status === 401) {
        return { success: false, error: { message: "Clave inválida", name: "Invalid Secret" } };
      }
      return { success: false, error: { message: `Error del servidor (${response.status})`, name: "Server Error" } };
    } catch {
      return { success: false, error: { message: "Servidor inalcanzable", name: "Network Error" } };
    }
  },

  logout: async () => {
    clearSession();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const token = localStorage.getItem("admin_secret");
    if (!token) {
      return { authenticated: false, error: { message: "No autorizado", name: "Unauthorized" }, logout: true, redirectTo: "/login" };
    }

    // Expiración local: forzar re-login sin consultar servidor
    if (isTokenExpired()) {
      clearSession();
      return { authenticated: false, error: { message: "Sesión expirada (24h)", name: "Expired" }, logout: true, redirectTo: "/login" };
    }

    // Cache válido por 30s para no sobrecargar al servidor
    const now = Date.now();
    if (_checkCache.valid && now - _checkCache.ts < CHECK_CACHE_TTL) {
      return { authenticated: true };
    }

    // Validar con el servidor
    try {
      const response = await fetch(`${API_URL}/admin/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        _checkCache = { valid: true, ts: now };
        return { authenticated: true };
      }
      // Token revocado o inválido en servidor
      clearSession();
      return { authenticated: false, error: { message: "Sesión expirada", name: "Unauthorized" }, logout: true, redirectTo: "/login" };
    } catch {
      // Error de red: ser optimista, no desloguear por fallo transitorio
      return { authenticated: true };
    }
  },

  getPermissions: async () => null,

  getIdentity: async () => {
    const token = localStorage.getItem("admin_secret");
    if (token && !isTokenExpired()) return { id: 1, name: "System Admin" };
    return null;
  },

  onError: async (error: unknown) => {
    console.error(error);
    return { error: error instanceof Error ? error : undefined };
  },
};
