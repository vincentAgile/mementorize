'use client';

import { useActionState } from 'react';
import { createQuoteAction } from './actions';

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(createQuoteAction, {});

  // After a successful submit React resets the form; after an error, the
  // values sent back in `state` are restored through defaultValue.
  return (
    <form action={formAction} className="quotes__form">
      <textarea name="text" placeholder="Texte de la citation" rows={3} defaultValue={state.text} required />
      <input name="author" placeholder="Auteur (optionnel)" defaultValue={state.author} />
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Ajouter'}
      </button>
    </form>
  );
}
