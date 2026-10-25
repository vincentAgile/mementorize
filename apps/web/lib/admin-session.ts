import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, ADMIN_STEP_COOKIE } from './session-cookie';

/**
 * MEM-82: the session of the administration console, apart from the users'
 * one: its own cookie, httpOnly, sent only under /admin, for 2 hours (not
 * renewed).
 */
const options = (expiresAt: string) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/admin',
  maxAge: Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
});

export async function createAdminSession(accessToken: string, expiresAt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, accessToken, options(expiresAt));
}

/** MEM-86: between the password and the code, the step of the login, for 5 minutes. */
export async function setAdminStep(challenge: string, expiresAt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_STEP_COOKIE, challenge, options(expiresAt));
}

export async function getAdminStep(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_STEP_COOKIE)?.value;
}

export async function deleteAdminStep(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: ADMIN_STEP_COOKIE, path: '/admin' });
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: ADMIN_COOKIE, path: '/admin' });
}

export async function getAdminToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value;
}
