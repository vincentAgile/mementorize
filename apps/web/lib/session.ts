import 'server-only';
import { cookies } from 'next/headers';
import { type ApiSession, REFRESH_COOKIE, SESSION_COOKIE, sessionCookies } from './session-cookie';

/**
 * The "session" is the pair of tokens given by the API (MEM-85), stored in
 * httpOnly cookies: JavaScript running in the page can't read them (XSS
 * protection), the browser sends them back to Next.js automatically, and
 * Next.js forwards the access token to the API as a Bearer token. The proxy
 * (proxy.ts) renews it before it expires.
 */
export async function createSession(session: ApiSession): Promise<void> {
  const cookieStore = await cookies();
  for (const cookie of sessionCookies(session)) cookieStore.set(cookie);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_COOKIE)?.value;
}
