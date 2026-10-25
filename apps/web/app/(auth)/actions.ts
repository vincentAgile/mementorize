'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate, endSession } from '../../lib/api';
import { createSession, deleteSession, getRefreshToken } from '../../lib/session';

// Server Actions: these functions run on the Next.js server, even though
// the forms that call them live in the browser.

export interface AuthFormState {
  error?: string;
  email?: string; // sent back so the field isn't emptied after an error
}

async function handleAuth(kind: 'login' | 'register', formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email et mot de passe sont requis.', email };
  }

  const result = await authenticate(kind, { email, password }, (await headers()).get('user-agent'));
  if (!result.ok) {
    return { error: result.message, email };
  }

  await createSession(result.session);
  redirect('/'); // must stay outside any try/catch: it works by throwing
}

export async function loginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return handleAuth('login', formData);
}

export async function registerAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return handleAuth('register', formData);
}

/** MEM-85: ends the session of this device in the API too, then removes both cookies. */
export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) await endSession(refreshToken);
  await deleteSession();
  redirect('/login');
}
