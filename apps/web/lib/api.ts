import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionToken } from './session';
import type {
  AuthUser,
  CreateQuoteInput,
  CreateVocabularyInput,
  Credentials,
  DueReviews,
  DueSummary,
  ImportAnalysis,
  ImportResult,
  LearningSession,
  Item,
  ItemType,
  MindMap,
  MindMapNode,
  Preferences,
  Profile,
  ReminderSettings,
  ReminderSettingsInput,
  RatedCard,
  ReviewRating,
} from './types';

// Server-side only: this module runs in Server Components and Server
// Actions, never in the browser ('server-only' makes the build fail if a
// client component imports it by mistake).
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

// Upper bound on any call to the API. Without it, a request the API never
// answers leaves the Server Action pending forever: the review buttons stay
// disabled (useFormStatus) and only a reload unblocks the page. With it, the
// call fails and the error page (app/error.tsx) offers to retry.
const API_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Public endpoints: register / login
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true; accessToken: string } | { ok: false; message: string };

export async function authenticate(kind: 'login' | 'register', credentials: Credentials): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "L'API est injoignable. Est-elle démarrée ?" };
  }

  if (res.ok) {
    const { accessToken } = (await res.json()) as { accessToken: string };
    return { ok: true, accessToken };
  }

  switch (res.status) {
    case 401:
      return { ok: false, message: 'Email ou mot de passe incorrect.' };
    case 409:
      return { ok: false, message: 'Un compte existe déjà avec cet email.' };
    case 400:
      return { ok: false, message: 'Email invalide ou mot de passe trop court (8 caractères minimum).' };
    default:
      return { ok: false, message: `Erreur inattendue de l'API (${res.status}).` };
  }
}

// ---------------------------------------------------------------------------
// Protected endpoints: the JWT from the session cookie is sent as a Bearer token
// ---------------------------------------------------------------------------

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();
  if (!token) {
    redirect('/login');
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (res.status === 401) {
    // Token expired or invalid: clear the cookie and go back to the login page.
    redirect('/session-expired');
  }
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} on ${path}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function getCurrentUser(): Promise<AuthUser> {
  return authedFetch<AuthUser>('/auth/me');
}

export function getItems(type?: ItemType): Promise<Item[]> {
  return authedFetch<Item[]>(type ? `/items?type=${type}` : '/items');
}

export function createQuote(input: CreateQuoteInput): Promise<unknown> {
  return authedFetch('/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Changes a vocabulary item (MEM-19); an empty example (English or French) removes it. */
export function updateVocabulary(id: string, input: CreateVocabularyInput): Promise<unknown> {
  return authedFetch(`/vocabulary/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Deletes a vocabulary item with its cards and history (MEM-20). */
export function deleteVocabulary(id: string): Promise<void> {
  return authedFetch<void>(`/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * MEM-63: puts items "En attente" in the learning queue (last, in this
 * order), or takes items out of it; MEM-64: puts items of the queue at its
 * head ("top").
 */
export function queueVocabularyItems(
  op: 'add' | 'remove' | 'top',
  ids: string[],
): Promise<{ changed: number; ignored: number }> {
  return authedFetch<{ changed: number; ignored: number }>(`/learning/queue/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/** MEM-64: moves an item of the learning queue to a position (1: the head). */
export function moveInLearningQueue(id: string, position: number): Promise<{ position: number; total: number }> {
  return authedFetch<{ position: number; total: number }>('/learning/queue/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, position }),
  });
}

/** MEM-59: deletes several vocabulary items at once; returns how many were deleted. */
export async function deleteVocabularyItems(ids: string[]): Promise<number> {
  const { deleted } = await authedFetch<{ deleted: number }>('/vocabulary/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return deleted;
}

/** The item created: where it went (MEM-62). */
export interface CreatedVocabulary {
  learningStatus: 'ToLearn' | 'Waiting';
  learnPosition: number | null;
}

export function createVocabulary(input: CreateVocabularyInput): Promise<CreatedVocabulary> {
  return authedFetch<CreatedVocabulary>('/vocabulary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getMindMap(id: string): Promise<MindMap> {
  return authedFetch<MindMap>(`/mind-maps/${encodeURIComponent(id)}`);
}

export function createMindMap(nodes: MindMapNode[]): Promise<MindMap> {
  return authedFetch<MindMap>('/mind-maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes }),
  });
}

/** Replaces the whole tree; the API adds or removes the branch cards accordingly. */
export function saveMindMap(id: string, nodes: MindMapNode[]): Promise<MindMap> {
  return authedFetch<MindMap>(`/mind-maps/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes }),
  });
}

export function deleteMindMap(id: string): Promise<void> {
  return authedFetch<void>(`/mind-maps/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getProfile(): Promise<Profile> {
  return authedFetch<Profile>('/profile');
}

/** Saves the first name and last name (trimmed by the API; an empty value clears it). */
export function saveProfile(input: { firstName: string; lastName: string }): Promise<Profile> {
  return authedFetch<Profile>('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getPreferences(): Promise<Preferences> {
  return authedFetch<Preferences>('/preferences');
}

/** Saves the preferences sent; the others stay as they are. */
export function savePreferences(input: Partial<Preferences>): Promise<Preferences> {
  return authedFetch<Preferences>('/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Up to five vocabulary items to learn, the oldest first (MEM-21). */
export function getLearningSession(): Promise<LearningSession> {
  return authedFetch<LearningSession>('/learning/session');
}

/** Step 2 of a learning session: the first review of the French → English card. */
export function learnVocabulary(itemId: string, rating: ReviewRating): Promise<RatedCard> {
  return authedFetch<RatedCard>(`/learning/${encodeURIComponent(itemId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
}

/** "Appris" in a review (MEM-22): the item leaves the review. */
export function markVocabularyLearned(itemId: string): Promise<unknown> {
  return authedFetch(`/learning/${encodeURIComponent(itemId)}/learned`, { method: 'POST' });
}

/** "Remettre en apprentissage" (MEM-22): a learned item goes back to the review. */
export function relearnVocabulary(itemId: string): Promise<unknown> {
  return authedFetch(`/learning/${encodeURIComponent(itemId)}/relearn`, { method: 'POST' });
}

/** « Appris » for a quote or a mind map branch (MEM-48): the card leaves the review. */
export function markCardLearned(cardId: string): Promise<unknown> {
  return authedFetch(`/reviews/${encodeURIComponent(cardId)}/learned`, { method: 'POST' });
}

/** « Remettre en révision » (MEM-48): back in the review, with the schedule it had. */
export function relearnCard(cardId: string): Promise<unknown> {
  return authedFetch(`/reviews/${encodeURIComponent(cardId)}/relearn`, { method: 'POST' });
}

/** How many cards are due, in all and per subject (the menu's counters, MEM-5). */
export function getDueSummary(): Promise<DueSummary> {
  return authedFetch<DueSummary>('/reviews/due/summary');
}

/** Cards to review now; with `type`, only those of one subject space. */
export function getDueReviews(limit = 20, type?: ItemType): Promise<DueReviews> {
  return authedFetch<DueReviews>(`/reviews/due?limit=${limit}${type ? `&type=${type}` : ''}`);
}

export function submitReview(cardId: string, rating: ReviewRating): Promise<RatedCard> {
  return authedFetch<RatedCard>(`/reviews/${encodeURIComponent(cardId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
}

// ---------------------------------------------------------------------------
// E-mail reminders (phase 11)
// ---------------------------------------------------------------------------

export function getReminderSettings(): Promise<ReminderSettings> {
  return authedFetch<ReminderSettings>('/reminders/settings');
}

export function saveReminderSettings(input: ReminderSettingsInput): Promise<ReminderSettings> {
  return authedFetch<ReminderSettings>('/reminders/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Sends the reminder e-mail right away. ApiError 503: no SMTP settings; 429: too soon; 502: refused. */
export function sendTestReminder(): Promise<void> {
  return authedFetch<void>('/reminders/test', { method: 'POST' });
}

/** Public (no session): the link of a reminder e-mail. False if the link is invalid. */
export async function unsubscribeFromReminders(user: string, token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/reminders/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, token }),
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (res.status === 400) return false;
  if (!res.ok) throw new ApiError(res.status, `API error ${res.status} on /reminders/unsubscribe`);
  return true;
}

/** For the public /health route: true when the API (and its database) answers. */
export async function isApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Import / export of the vocabulary as CSV (MEM-50)
// ---------------------------------------------------------------------------

export type CsvExport =
  { ok: true; body: ReadableStream<Uint8Array>; disposition: string } | { ok: false; status: number };

/**
 * The vocabulary as a CSV file (MEM-52), for app/anglais/import-export/export/route.ts.
 * Not through authedFetch, which reads JSON: the file is passed on as it is.
 */
export async function exportVocabularyCsv(): Promise<CsvExport> {
  const token = await getSessionToken();
  if (!token) return { ok: false, status: 401 };
  const res = await fetch(`${API_URL}/vocabulary-csv/export`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) return { ok: false, status: res.status };
  return {
    ok: true,
    body: res.body,
    disposition: res.headers.get('content-disposition') ?? 'attachment; filename="mementorize-anglais.csv"',
  };
}

/** What importing this CSV file would do, line by line (MEM-53). Nothing is saved. */
export function previewVocabularyImport(content: string): Promise<ImportAnalysis> {
  return authedFetch<ImportAnalysis>('/vocabulary-csv/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/** Imports the lines "to import" of this CSV file, all or none (MEM-54). */
export function importVocabularyCsv(content: string): Promise<ImportResult> {
  return authedFetch<ImportResult>('/vocabulary-csv/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

// ---------------------------------------------------------------------------
// Pronunciation (MEM-39)
// ---------------------------------------------------------------------------

export type PronunciationAudio =
  | { ok: true; body: ReadableStream<Uint8Array>; mimeType: string; length: string | null }
  | { ok: false; status: number };

/**
 * The audio of a vocabulary item, for app/prononciation/[id]/route.ts. Not
 * through authedFetch: an audio file that is missing (404), or a session
 * that expired (401), mustn't redirect anywhere, the page just falls back
 * on the browser's speech synthesis.
 */
export async function pronunciationAudio(itemId: string): Promise<PronunciationAudio> {
  const token = await getSessionToken();
  if (!token) return { ok: false, status: 401 };
  try {
    const res = await fetch(`${API_URL}/vocabulary/${encodeURIComponent(itemId)}/pronunciation`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return { ok: false, status: res.status === 401 ? 401 : 404 };
    return {
      ok: true,
      body: res.body,
      mimeType: res.headers.get('content-type') ?? 'audio/mpeg',
      length: res.headers.get('content-length'),
    };
  } catch {
    return { ok: false, status: 502 };
  }
}
