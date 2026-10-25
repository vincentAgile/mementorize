'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminLogin } from '../../lib/admin-api';
import { createAdminSession, deleteAdminSession } from '../../lib/admin-session';

export interface AdminLoginState {
  error?: string;
  email?: string;
}

/** The browser's address, as Traefik saw it: for the limit on failed logins (MEM-82). */
async function clientAddress(): Promise<string | null> {
  const all = await headers();
  return all.get('x-real-ip') ?? all.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

export async function adminLoginAction(_previous: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'E-mail et mot de passe sont requis.', email };

  const result = await adminLogin(email, password, await clientAddress());
  if (!result.ok) return { error: result.message, email };

  await createAdminSession(result.accessToken, result.expiresAt);
  redirect('/admin');
}

export async function adminLogoutAction(): Promise<void> {
  await deleteAdminSession();
  redirect('/admin/connexion');
}
