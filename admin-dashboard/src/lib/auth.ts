const SECRET_KEY  = 'admin_secret';
const EXPIRES_KEY = 'admin_secret_expires';
const TTL_MS      = 24 * 60 * 60 * 1000; // 24 h

export function saveSession(secret: string): void {
  localStorage.setItem(SECRET_KEY, secret);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + TTL_MS));
}

export function clearSession(): void {
  localStorage.removeItem(SECRET_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function getSecret(): string | null {
  const secret  = localStorage.getItem(SECRET_KEY);
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!secret || !expires) return null;
  if (Date.now() > parseInt(expires, 10)) {
    clearSession();
    return null;
  }
  return secret;
}
