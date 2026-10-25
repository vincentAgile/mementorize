import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE, SESSION_COOKIE, secondsUntilExpiry, sessionCookies } from './lib/session-cookie';
import { renewSession } from './lib/session-renewal';

// Pages reachable without being logged in.
// /unsubscribe: the link of a reminder e-mail, opened without a session.
// /health: checked by Uptime Kuma (phase 11).
const PUBLIC_PATHS = ['/login', '/register', '/session-expired', '/unsubscribe', '/health'];

// Where the session is not renewed: /session-expired ends it, /health is a probe.
const NO_RENEWAL = ['/session-expired', '/health'];

/** The access token is renewed when it has less than this left (seconds). */
const RENEW_BEFORE = 60;

/**
 * Runs before every matched request: pages, their data (RSC) and Server
 * Actions.
 * - MEM-85: when the access token has expired or is about to, it is
 *   renewed here with the renewal token, silently: the request goes on
 *   with the new one, and the browser gets the new cookies. When the
 *   session is over, back to the login page (« session expirée »).
 * - Otherwise an *optimistic* check: it only looks for the session cookies,
 *   without validating them. The real check happens in the API
 *   (JwtAuthGuard) on every call.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const access = request.cookies.get(SESSION_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refresh && !NO_RENEWAL.includes(pathname) && (!access || secondsUntilExpiry(access) < RENEW_BEFORE)) {
    const renewed = await renewSession(refresh, request.headers.get('user-agent'));
    if (renewed === 'expired') {
      if (isPublic) return withoutSession(NextResponse.next());
      return withoutSession(NextResponse.redirect(new URL('/login?expired=1', request.url)));
    }
    if (renewed !== 'unavailable') {
      const cookies = sessionCookies(renewed);
      // The request goes on with the new tokens (Server Components and Actions read them)...
      for (const cookie of cookies) request.cookies.set(cookie.name, cookie.value);
      const response = NextResponse.next({ request: { headers: request.headers } });
      // ...and the browser keeps them.
      for (const cookie of cookies) response.cookies.set(cookie);
      return response;
    }
    // The API didn't answer: go on as is; the page says so if it needs the API.
  }

  if (!isPublic && !access && !refresh) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

function withoutSession(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export const config = {
  // Everything except Next.js internals and static files, the icons
  // included (MEM-13): the login page shows them before any session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
