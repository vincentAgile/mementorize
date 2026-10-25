import 'server-only';
import { redirect } from 'next/navigation';
import { getAdminToken } from './admin-session';

// MEM-82: the calls of the administration console to the API, with the
// administration token (never the user's).
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const API_TIMEOUT_MS = 15_000;

export interface Administrator {
  id: string;
  email: string;
}

export type AdminLoginResult = { ok: true; accessToken: string; expiresAt: string } | { ok: false; message: string };

/** `client`: the address of the browser, for the limit on failed logins. */
export async function adminLogin(email: string, password: string, client: string | null): Promise<AdminLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(client && { 'X-Admin-Client-IP': client }) },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: 'Le serveur ne répond pas. Réessayez dans un instant.' };
  }
  if (res.ok) {
    const { accessToken, expiresAt } = (await res.json()) as { accessToken: string; expiresAt: string };
    return { ok: true, accessToken, expiresAt };
  }
  switch (res.status) {
    case 401:
    case 400:
      return { ok: false, message: 'Identifiants incorrects.' };
    case 429:
      return { ok: false, message: 'Trop de tentatives échouées : réessayez dans quelques minutes.' };
    case 503:
      return { ok: false, message: 'La console d’administration n’est pas activée sur ce serveur.' };
    default:
      return { ok: false, message: `Erreur inattendue du serveur (${res.status}).` };
  }
}

/** A route of the console; without a valid session, back to its login page. */
async function adminFetch<T>(path: string): Promise<T> {
  const token = await getAdminToken();
  if (!token) redirect('/admin/connexion');
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 503) redirect('/admin/session-expiree');
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export function getAdministrator(): Promise<Administrator> {
  return adminFetch<Administrator>('/admin/auth/me');
}
