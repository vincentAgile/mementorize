// Kept in their own module (no server-only imports) so proxy.ts can use them too.

/** The access token (MEM-85: 15 minutes), sent to the API with each call. */
export const SESSION_COOKIE = 'mementorize_session';

/**
 * The renewal token (MEM-85: 30 days, sliding): it gets a new access token
 * without the password. On every path, not only one: the proxy renews the
 * session before any request (a page, a Server Action), so it must see it.
 */
export const REFRESH_COOKIE = 'mementorize_refresh';

/** MEM-82: the session of the administration console, under /admin only. */
export const ADMIN_COOKIE = 'mementorize_admin';

/** MEM-86: the step between the password and the code (5 minutes), under /admin only. */
export const ADMIN_STEP_COOKIE = 'mementorize_admin_step';

/** What the API gives at login, registration and renewal. */
export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** The options of the two cookies: httpOnly (out of reach of the page's scripts), HTTPS only in production. */
export function sessionCookies(session: ApiSession, now = Date.now()) {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  return [
    {
      ...common,
      name: SESSION_COOKIE,
      value: session.accessToken,
      maxAge: secondsUntilExpiry(session.accessToken, now),
    },
    {
      ...common,
      name: REFRESH_COOKIE,
      value: session.refreshToken,
      maxAge: Math.max(0, Math.floor((new Date(session.refreshExpiresAt).getTime() - now) / 1000)),
    },
  ];
}

/**
 * Seconds before the JWT expires, from its `exp` claim. No signature check
 * here: that's the API's job. 0 when it can't be read.
 */
export function secondsUntilExpiry(token: string, now = Date.now()): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return Math.max(0, Math.floor(payload.exp - now / 1000));
  } catch {
    return 0;
  }
}
