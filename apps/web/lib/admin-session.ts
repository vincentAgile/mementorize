import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from './session-cookie';

/**
 * MEM-82: the session of the administration console, apart from the users'
 * one: its own cookie, httpOnly, sent only under /admin, for 2 hours (not
 * renewed).
 */
export async function createAdminSession(accessToken: string, expiresAt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  });
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: ADMIN_COOKIE, path: '/admin' });
}

export async function getAdminToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value;
}
