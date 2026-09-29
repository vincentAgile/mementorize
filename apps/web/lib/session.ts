import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './session-cookie';

/**
 * The "session" is simply the JWT returned by the API, stored in an
 * httpOnly cookie: JavaScript running in the page can't read it (XSS
 * protection), the browser sends it back to Next.js automatically, and
 * Next.js forwards it to the API as a Bearer token.
 */
export async function createSession(accessToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',
    path: '/',
    maxAge: secondsUntilExpiry(accessToken), // cookie dies with the token
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

/**
 * Reads the `exp` claim of the JWT. No signature check here: that's the
 * API's job. We only need the expiry date to size the cookie.
 */
function secondsUntilExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 60 * 60; // fallback: 1 hour
  }
}
