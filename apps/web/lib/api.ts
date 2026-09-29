import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionToken } from './session';
import type {
  AuthUser,
  CreateQuoteInput,
  CreateVocabularyInput,
  Credentials,
  DueReviews,
  Item,
  ItemType,
  ReviewRating,
} from './types';

// Server-side only: this module runs in Server Components and Server
// Actions, never in the browser ('server-only' makes the build fail if a
// client component imports it by mistake).
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

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

export function createVocabulary(input: CreateVocabularyInput): Promise<unknown> {
  return authedFetch('/vocabulary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getDueReviews(limit = 20): Promise<DueReviews> {
  return authedFetch<DueReviews>(`/reviews/due?limit=${limit}`);
}

export function submitReview(cardId: string, rating: ReviewRating): Promise<void> {
  return authedFetch<void>(`/reviews/${encodeURIComponent(cardId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
}
