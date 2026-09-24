'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { AuthFormState } from './actions';

interface AuthFormProps {
  mode: 'login' | 'register';
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}

export function AuthForm({ mode, action }: AuthFormProps) {
  // useActionState: calls the Server Action on submit, and gives back its
  // latest return value (state) plus a "pending" flag while it runs.
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === 'login';

  return (
    <form action={formAction} className="auth-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          minLength={isLogin ? undefined : 8}
          required
        />
      </label>

      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? 'Un instant…' : isLogin ? 'Se connecter' : 'Créer mon compte'}
      </button>

      <p className="auth-form__switch">
        {isLogin ? (
          <>
            Pas encore de compte ? <Link href="/register">Créer un compte</Link>
          </>
        ) : (
          <>
            Déjà inscrit ? <Link href="/login">Se connecter</Link>
          </>
        )}
      </p>
    </form>
  );
}
