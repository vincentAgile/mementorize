import type { ApiSession } from './session-cookie';

// No server-only import: used by proxy.ts.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = 10_000;

/**
 * Renews a session with its renewal token (MEM-85): a new access token and
 * a new renewal token. 'expired': the session is over (30 days without use,
 * logout, revoked); 'unavailable': the API couldn't answer, try later.
 * `device`: the browser's User-Agent, kept by the API with the session.
 */
export async function renewSession(
  refreshToken: string,
  device: string | null,
): Promise<ApiSession | 'expired' | 'unavailable'> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(device && { 'User-Agent': device }) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return (await res.json()) as ApiSession;
    return res.status === 401 || res.status === 400 ? 'expired' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
