'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { unsubscribeAction } from './actions';

export function UnsubscribeForm({ user, token }: { user: string; token: string }) {
  const [state, action, pending] = useActionState(unsubscribeAction, {});

  if (state.done) {
    return (
      <p className="notice">
        C’est fait : tu ne recevras plus de rappel. Tu peux les réactiver dans les{' '}
        <Link href="/settings">réglages</Link>.
      </p>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="user" value={user} />
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Un instant…' : 'Ne plus recevoir les rappels'}
      </button>
    </form>
  );
}
