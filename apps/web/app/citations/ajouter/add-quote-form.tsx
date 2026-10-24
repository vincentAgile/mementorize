'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { firstWords, NBSP } from '../../../lib/format';
import { ordinal } from '../../lists/ordinal';
import { addQuoteAction, type QuoteAddState } from '../actions';
import { QuoteFields, type QuoteValues } from '../quote-fields';

const EMPTY: QuoteValues = { text: '', author: '', source: '' };

/**
 * The form of the "Ajouter" tab of the Citations space (MEM-71), made to
 * add several quotes in a row: the cursor starts in the text and comes
 * back to it after each quote, a message says where the quote went, and
 * errors show next to their field. The author and the source stay after a
 * quote is added, for the next quotes of the same author or work, and so
 * does the choice of the learning queue, checked when the tab opens.
 */
export function AddQuoteForm({ authors }: { authors: string[] }) {
  const [state, action] = useActionState<QuoteAddState, FormData>(addQuoteAction, {});
  const form = useRef<HTMLFormElement>(null);

  // After each answer of the server: on the first field in error, or back to
  // the text, ready for the next quote.
  useEffect(() => {
    if (!state.added && !state.fieldErrors) return;
    const target =
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.elements.namedItem('text');
    (target as HTMLElement | null)?.focus();
  }, [state]);

  const values =
    state.values ??
    (state.added ? { ...EMPTY, author: state.added.author, source: state.added.source } : EMPTY);
  const queue = state.added?.queue ?? state.queue ?? true;

  return (
    <form ref={form} action={action} className="add-form" noValidate>
      {state.added && (
        <p className="notice" role="status">
          «{NBSP}{firstWords(state.added.text, 6)}{NBSP}» ajoutée,{' '}
          {state.added.position !== null ? (
            <>{ordinal(state.added.position)} dans la file d’apprentissage.</>
          ) : (
            'en attente.'
          )}
        </p>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <QuoteFields values={values} errors={state.fieldErrors} idPrefix="add" autoFocus authors={authors} />
      <div className="add-form__actions">
        {/* The key puts the box back as chosen after the form is reset. */}
        <label key={String(queue)} className="add-form__queue">
          <input type="checkbox" name="queue" defaultChecked={queue} />
          Ajouter à la file d’apprentissage (en dernière position)
        </label>
        <AddButton />
      </div>
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Ajout…' : 'Ajouter'}
    </button>
  );
}
