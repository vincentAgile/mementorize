'use client';

import { useActionState } from 'react';
import { type AdminLoginState, adminLoginAction } from '../actions';

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<AdminLoginState, FormData>(adminLoginAction, {});
  return (
    <form action={formAction} className="auth-form">
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" defaultValue={state.email} required />
      </label>
      <label>
        Mot de passe
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Un instant…' : 'Se connecter'}
      </button>
    </form>
  );
}
