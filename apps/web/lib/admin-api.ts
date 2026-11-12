import 'server-only';
import { redirect } from 'next/navigation';
import { getAdminToken } from './admin-session';
import type { AdminAiListSettings, AiListUsageReport } from './admin-ai-lists';
import type { AdminChatSettings, ChatUsageReport } from './admin-chat';
import type { ImportAnalysis, ImportRow, LanguageLevel } from './types';

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

const UNREACHABLE = 'Le serveur ne répond pas. Réessaie dans un instant.';
const TOO_MANY = 'Trop de tentatives échouées : réessaie dans quelques minutes.';
const OFF = 'La console d’administration n’est pas activée sur ce serveur.';
export const STEP_EXPIRED = 'L’étape de connexion a expiré : saisis de nouveau ton mot de passe.';

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
            ? 'Code incorrect : vérifie l’heure du téléphone, puis saisis le code affiché maintenant.'
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
  return adminSend('POST', path, body, client);
}

/** The same, with any method (MEM-116: PATCH, DELETE). */
async function adminSend(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  client: string | null = null,
): Promise<Response | null> {
  const token = await getAdminToken();
  if (!token) redirect('/admin/connexion');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(client && { 'X-Admin-Client-IP': client }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  if (res.status === 409) return { ok: false, message: 'Le réglage a déjà changé : recharge la page.' };
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

// --- MEM-116: the predefined lists of the catalogue ---------------------------

export type { LanguageLevel };

/** A predefined list of vocabulary, with its number of words. */
export interface CatalogList {
  id: string;
  title: string;
  description: string | null;
  level: LanguageLevel;
  published: boolean;
  entries: number;
  createdAt: string;
  updatedAt: string;
}

/** What the console sends for a list. */
export interface CatalogListInput {
  title: string;
  description: string | null;
  level: LanguageLevel;
  published: boolean;
}

/** Every list, by level then by title. */
export function getCatalogLists(): Promise<CatalogList[]> {
  return adminFetch<CatalogList[]>('/admin/catalog/lists');
}

/** One list; null when it doesn't exist (any more). */
export async function getCatalogList(id: string): Promise<CatalogList | null> {
  try {
    return await adminFetch<CatalogList>(`/admin/catalog/lists/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof Error && /API error (400|404)/.test(error.message)) return null;
    throw error;
  }
}

/** The answer of the API to a change of a list: done, or why not (its status and message). */
export type CatalogChange = { ok: true } | { ok: false; status: number | null; message?: string };

async function catalogChange(res: Response | null): Promise<CatalogChange> {
  if (!res) return { ok: false, status: null };
  if (res.ok) return { ok: true };
  const { message } = (await res.json().catch(() => ({}))) as { message?: unknown };
  return { ok: false, status: res.status, message: typeof message === 'string' ? message : undefined };
}

export async function createCatalogList(input: CatalogListInput): Promise<CatalogChange> {
  return catalogChange(await adminSend('POST', '/admin/catalog/lists', input));
}

export async function updateCatalogList(id: string, input: Partial<CatalogListInput>): Promise<CatalogChange> {
  return catalogChange(await adminSend('PATCH', `/admin/catalog/lists/${encodeURIComponent(id)}`, input));
}

export async function deleteCatalogList(id: string): Promise<CatalogChange> {
  return catalogChange(await adminSend('DELETE', `/admin/catalog/lists/${encodeURIComponent(id)}`));
}

// --- MEM-117: the words of a predefined list ----------------------------------

/** A word of a list, in the order of the list. */
export interface CatalogEntry {
  id: string;
  position: number;
  french: string;
  english: string;
  topic: string | null;
  frenchExample: string | null;
  englishExample: string | null;
}

/** What the console sends for a word; an empty optional text removes it. */
export interface CatalogEntryInput {
  french: string;
  english: string;
  topic: string;
  frenchExample: string;
  englishExample: string;
}

const listPath = (listId: string) => `/admin/catalog/lists/${encodeURIComponent(listId)}`;

/** The words of a list; null when the list doesn't exist (any more). */
export async function getCatalogEntries(listId: string): Promise<CatalogEntry[] | null> {
  try {
    return await adminFetch<CatalogEntry[]>(`${listPath(listId)}/entries`);
  } catch (error) {
    if (error instanceof Error && /API error (400|404)/.test(error.message)) return null;
    throw error;
  }
}

export async function createCatalogEntry(listId: string, input: CatalogEntryInput): Promise<CatalogChange> {
  return catalogChange(await adminSend('POST', `${listPath(listId)}/entries`, input));
}

export async function updateCatalogEntry(listId: string, id: string, input: CatalogEntryInput): Promise<CatalogChange> {
  return catalogChange(await adminSend('PATCH', `${listPath(listId)}/entries/${encodeURIComponent(id)}`, input));
}

export async function deleteCatalogEntry(listId: string, id: string): Promise<CatalogChange> {
  return catalogChange(await adminSend('DELETE', `${listPath(listId)}/entries/${encodeURIComponent(id)}`));
}

/** The words selected, all at once (null: the API couldn't be reached). */
export async function deleteCatalogEntries(
  listId: string,
  ids: string[],
): Promise<{ ok: true; deleted: number } | { ok: false; status: number | null; message?: string }> {
  const res = await adminSend('POST', `${listPath(listId)}/entries/delete`, { ids });
  if (res?.ok) return { ok: true, ...((await res.json()) as { deleted: number }) };
  const change = await catalogChange(res);
  return change.ok ? { ok: false, status: null } : change;
}

/** The analysis of a file to import into a list: its lines, and the room left in the list (500 words at most). */
export type CatalogImportAnalysis = ImportAnalysis<ImportRow> & { room: number };

/** The answer to an import: done, why the file can't be read, or too many words for the room left. */
export type CatalogImportResult =
  | { ok: true; imported: number; duplicate: number; error: number }
  | Extract<ImportAnalysis<ImportRow>, { ok: false }>
  | { ok: false; problem: 'tooManyWords'; room: number; new: number };

/** What importing this file would do (MEM-117); nothing is saved. null: the API couldn't answer. */
export async function previewCatalogImport(listId: string, content: string): Promise<CatalogImportAnalysis | null> {
  const res = await adminSend('POST', `${listPath(listId)}/preview`, { content });
  return res?.ok ? ((await res.json()) as CatalogImportAnalysis) : null;
}

/** Imports the lines "to import" of the file, all or none. null: the API couldn't answer. */
export async function importCatalogCsv(listId: string, content: string): Promise<CatalogImportResult | null> {
  const res = await adminSend('POST', `${listPath(listId)}/import`, { content });
  return res?.ok ? ((await res.json()) as CatalogImportResult) : null;
}

/** The list as a CSV file, from the API: its body and its name, to pass on to the browser. */
export async function exportCatalogCsv(
  listId: string,
): Promise<{ ok: true; body: ReadableStream<Uint8Array>; disposition: string } | { ok: false; status: number }> {
  const token = await getAdminToken();
  if (!token) return { ok: false, status: 401 };
  const res = await fetch(`${API_URL}${listPath(listId)}/export`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) return { ok: false, status: res.status };
  return {
    ok: true,
    body: res.body,
    disposition: res.headers.get('content-disposition') ?? 'attachment; filename="mementorize-liste.csv"',
  };
}

// --- MEM-143: « Générer avec l'IA » ---------------------------------------------

/** Its parameters, and whether it is active, off or without an AI on the server. */
export function getAiListSettings(): Promise<AdminAiListSettings> {
  return adminFetch<AdminAiListSettings>('/admin/ai-lists/settings');
}

export type AiListSettingsChange = { ok: true; settings: AdminAiListSettings } | { ok: false; status: number | null };

export async function saveAiListSettings(input: {
  enabled: boolean;
  generationsPerDay: number;
}): Promise<AiListSettingsChange> {
  const res = await adminSend('PUT', '/admin/ai-lists/settings', input);
  if (!res) return { ok: false, status: null };
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, settings: (await res.json()) as AdminAiListSettings };
}

/** The last 30 days and the 10 biggest users of the month: numbers only. */
export function getAiListUsage(): Promise<AiListUsageReport> {
  return adminFetch<AiListUsageReport>('/admin/ai-lists/usage');
}

// --- MEM-135: the Chat IA -------------------------------------------------------

/** Its parameters, and whether it is active, off or without an AI on the server. */
export function getChatSettings(): Promise<AdminChatSettings> {
  return adminFetch<AdminChatSettings>('/admin/chat/settings');
}

export type ChatSettingsChange = { ok: true; settings: AdminChatSettings } | { ok: false; status: number | null };

export async function saveChatSettings(input: Omit<AdminChatSettings, 'state'>): Promise<ChatSettingsChange> {
  const res = await adminSend('PUT', '/admin/chat/settings', input);
  if (!res) return { ok: false, status: null };
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, settings: (await res.json()) as AdminChatSettings };
}

/** The last 30 days and the 10 biggest users of the month: numbers only, never a text. */
export function getChatUsage(): Promise<ChatUsageReport> {
  return adminFetch<ChatUsageReport>('/admin/chat/usage');
}
