import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session-cookie';

// Pages reachable without being logged in.
// /unsubscribe: the link of a reminder e-mail, opened without a session.
// /health: checked by Uptime Kuma (phase 11).
const PUBLIC_PATHS = ['/login', '/register', '/session-expired', '/unsubscribe', '/health'];

/**
 * Runs before every matched request. It's an *optimistic* check: it only
 * looks for the session cookie, without validating the token. The real
 * check happens in the API (JwtAuthGuard) on every call.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static files, the icons
  // included (MEM-13): the login page shows them before any session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
