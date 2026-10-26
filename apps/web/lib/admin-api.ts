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
  /** MEM-86: the recovery codes not used yet. */
  recoveryCodesLeft: number;
  /** MEM-88: on, or turned off by the administrator. */
  twoFactor: { enabled: boolean; enabledAt: string | null; disabledAt: string | null };
}

/** MEM-84: the items of a space (Anglais, Citations), per state. */
export interface StatusCounts {
  Waiting: number;
  ToLearn: number;
  Learning: number;
  Learned: number;
  total: number;
}

export interface SpaceCounts {
  Vocabulary: StatusCounts;
  Quote: StatusCounts;
  /** Mind maps: how many, and their branches in review or learned. */
  MindMap: { total: number; branchesInReview: number; branchesLearned: number };
  total: number;
}

/** A user in the console: their account and counters, never the content of their items. */
export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  counts: SpaceCounts;
}

export interface AdminUserList {
  users: AdminUserRow[];
  totals: SpaceCounts;
}

/** After the password (MEM-86): the code is asked, or the two-step login is activated first. */
export type AdminLoginResult =
  | { ok: true; step: 'code' | 'activation'; challenge: string; expiresAt: string }
  /** MEM-88: the two-step login is off: the password opened the session. */
  | { ok: true; step: 'session'; session: AdminSession }
  | { ok: false; message: string };

/** A session, once the code is accepted; at the activation, with the recovery codes. */
export interface AdminSession {
  accessToken: string;
  expiresAt: string;
  recoveryCodesLeft: number;
  recoveryCodes?: string[];
}

export type AdminCodeResult = { ok: true; session: AdminSession } | { ok: false; expired?: boolean; message: string };

export interface Enrollment {
  email: string;
  secret: string;
  otpauthUri: string;
}

const UNREACHABLE = 'Le serveur ne répond pas. Réessayez dans un instant.';
const TOO_MANY = 'Trop de tentatives échouées : réessayez dans quelques minutes.';
const OFF = 'La console d’administration n’est pas activée sur ce serveur.';
export const STEP_EXPIRED = 'L’étape de connexion a expiré : saisissez de nouveau votre mot de passe.';

/** A public route of the login; `client`: the address of the browser, for the limit on failures. */
async function post(path: string, body: unknown, client?: string | null): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(client && { 'X-Admin-Client-IP': client }) },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** The password, first step. */
export async function adminLogin(email: string, password: string, client: string | null): Promise<AdminLoginResult> {
  const res = await post('/admin/auth/login', { email, password }, client);
  if (!res) return { ok: false, message: UNREACHABLE };
  if (res.ok) {
    const body = (await res.json()) as
      | { step: 'code' | 'activation'; challenge: string; expiresAt: string }
      | { step: 'session'; session: AdminSession };
    return { ok: true, ...body };
  }
  switch (res.status) {
    case 401:
    case 400:
      return { ok: false, message: 'Identifiants incorrects.' };
    case 429:
      return { ok: false, message: TOO_MANY };
    case 503:
      return { ok: false, message: OFF };
    default:
      return { ok: false, message: `Erreur inattendue du serveur (${res.status}).` };
  }
}

/** MEM-86: the key to add to the authenticator app. null: the step expired, or it is already active. */
export async function adminEnrollment(challenge: string): Promise<Enrollment | 'expired' | 'active' | null> {
  const res = await post('/admin/auth/enrollment', { challenge });
  if (res?.ok) return (await res.json()) as Enrollment;
  if (res?.status === 410) return 'expired';
  if (res?.status === 409) return 'active';
  return null;
}

/** MEM-86: the code (`verify`), or the first code that activates the two-step login (`activate`). */
export async function adminCode(
  kind: 'verify' | 'activate',
  challenge: string,
  code: string,
  client: string | null,
): Promise<AdminCodeResult> {
  const res = await post(`/admin/auth/${kind}`, { challenge, code }, client);
  if (!res) return { ok: false, message: UNREACHABLE };
  if (res.ok) return { ok: true, session: (await res.json()) as AdminSession };
  switch (res.status) {
    case 401:
    case 400:
      return {
        ok: false,
        message:
          kind === 'activate'
            ? 'Code incorrect : vérifiez l’heure du téléphone, puis saisissez le code affiché maintenant.'
            : 'Code incorrect ou déjà utilisé.',
      };
    case 410:
    case 409:
      return { ok: false, expired: true, message: STEP_EXPIRED };
    case 429:
      return { ok: false, message: TOO_MANY };
    case 503:
      return { ok: false, message: OFF };
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

/** MEM-84: the users, their last activity and the number of their items. */
export function getAdminUsers(): Promise<AdminUserList> {
  return adminFetch<AdminUserList>('/admin/users');
}

/** A change of the console, with the session; null: the API couldn't be reached. */
async function adminPost(path: string, body: unknown, client: string | null): Promise<Response | null> {
  const token = await getAdminToken();
  if (!token) redirect('/admin/connexion');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(client && { 'X-Admin-Client-IP': client }),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  // A 401 of the guard: the session is over (2 hours, account deleted or reset). The 401 of a
  // wrong password or code says « Invalid … »: the form shows it.
  if (res.status === 401) {
    const { message } = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { message?: string };
    if (!message?.startsWith('Invalid')) redirect('/admin/session-expiree');
  }
  return res;
}

export type TwoFactorChange = { ok: true } | { ok: false; message: string };

function twoFactorError(res: Response | null, wrong: string): { ok: false; message: string } {
  if (!res) return { ok: false, message: UNREACHABLE };
  if (res.status === 401 || res.status === 400) return { ok: false, message: wrong };
  if (res.status === 429) return { ok: false, message: TOO_MANY };
  if (res.status === 409) return { ok: false, message: 'Le réglage a déjà changé : rechargez la page.' };
  return { ok: false, message: `Erreur inattendue du serveur (${res.status}).` };
}

/** MEM-88: turns the two-step login of the logged-in account off, with its password and a code. */
export async function disableTwoFactor(
  password: string,
  code: string,
  client: string | null,
): Promise<TwoFactorChange> {
  const res = await adminPost('/admin/auth/2fa/disable', { password, code }, client);
  return res?.ok ? { ok: true } : twoFactorError(res, 'Mot de passe ou code incorrect.');
}

/** MEM-88: after the password, the step of the activation, as at a first login. */
export async function enableTwoFactor(
  password: string,
  client: string | null,
): Promise<{ ok: true; challenge: string; expiresAt: string } | { ok: false; message: string }> {
  const res = await adminPost('/admin/auth/2fa/enable', { password }, client);
  if (res?.ok) return { ok: true, ...((await res.json()) as { challenge: string; expiresAt: string }) };
  return twoFactorError(res, 'Mot de passe incorrect.');
}
