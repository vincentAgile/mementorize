'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { type AdminCodeState, adminCodeAction } from '../../actions';

export function CodeForm() {
  const [state, formAction, pending] = useActionState<AdminCodeState, FormData>(adminCodeAction, {});
  return (
    <form action={formAction} className="auth-form">
      <label>
        Code
        <input
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={40}
          className="admin-code__input"
          required
          autoFocus
        />
      </label>
      <p className="settings__hint">Téléphone indisponible ? Saisissez l’un de vos codes de secours.</p>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error} {state.expired && <Link href="/admin/connexion">Revenir à la connexion</Link>}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Un instant…' : 'Valider'}
      </button>
    </form>
  );
}
