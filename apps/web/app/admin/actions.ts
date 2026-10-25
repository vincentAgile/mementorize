'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminCode, adminLogin, STEP_EXPIRED } from '../../lib/admin-api';
import {
  createAdminSession,
  deleteAdminSession,
  deleteAdminStep,
  getAdminStep,
  setAdminStep,
} from '../../lib/admin-session';

export interface AdminLoginState {
  error?: string;
  email?: string;
}

export interface AdminCodeState {
  error?: string;
  /** The step of the login expired (5 minutes): back to the password. */
  expired?: boolean;
  /** MEM-86: at the activation, the recovery codes, shown this once only. */
  recoveryCodes?: string[];
}

/** The browser's address, as Traefik saw it: for the limit on failed logins (MEM-82). */
async function clientAddress(): Promise<string | null> {
  const all = await headers();
  return all.get('x-real-ip') ?? all.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

/** The password: then the code, or the activation of the two-step login the first time (MEM-86). */
export async function adminLoginAction(_previous: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'E-mail et mot de passe sont requis.', email };

  const result = await adminLogin(email, password, await clientAddress());
  if (!result.ok) return { error: result.message, email };

  await setAdminStep(result.challenge, result.expiresAt);
  redirect(result.step === 'code' ? '/admin/connexion/code' : '/admin/connexion/activation');
}

/** The code of the authenticator app, or a recovery code: the session starts. */
export async function adminCodeAction(_previous: AdminCodeState, formData: FormData): Promise<AdminCodeState> {
  const outcome = await submitCode('verify', formData);
  if ('state' in outcome) return outcome.state;
  redirect('/admin');
}

/**
 * The first code: the two-step login is on, the session starts, and the
 * recovery codes are shown, this once only (no redirection: the page shows
 * them, then a link leads to the console).
 */
export async function adminActivateAction(_previous: AdminCodeState, formData: FormData): Promise<AdminCodeState> {
  const outcome = await submitCode('activate', formData);
  if ('state' in outcome) return outcome.state;
  return { recoveryCodes: outcome.recoveryCodes };
}

async function submitCode(
  kind: 'verify' | 'activate',
  formData: FormData,
): Promise<{ state: AdminCodeState } | { recoveryCodes: string[] }> {
  const challenge = await getAdminStep();
  if (!challenge) return { state: { expired: true, error: STEP_EXPIRED } };
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { state: { error: 'Saisissez le code.' } };

  const result = await adminCode(kind, challenge, code, await clientAddress());
  if (!result.ok) {
    if (result.expired) await deleteAdminStep();
    return { state: { error: result.message, expired: result.expired } };
  }
  await createAdminSession(result.session.accessToken, result.session.expiresAt);
  if (kind === 'verify') await deleteAdminStep();
  return { recoveryCodes: result.session.recoveryCodes ?? [] };
}

export async function adminLogoutAction(): Promise<void> {
  await deleteAdminSession();
  redirect('/admin/connexion');
}
