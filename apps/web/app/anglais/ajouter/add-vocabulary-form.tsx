'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { addVocabularyAction, type VocabularyAddState } from '../actions';
import { VocabularyFields, type VocabularyValues } from '../vocabulary-fields';

const EMPTY: VocabularyValues = { word: '', example: '', translation: '', frenchExample: '' };

/**
 * The form of the "Ajouter" tab (MEM-27), in two blocks, Anglais and
 * Français (MEM-43), made to add several items in a row: the cursor starts
 * in the first field and comes back to it after each item, a message
 * recalls the item just added, and errors show next to their field
 * (aria-invalid, aria-describedby).
 */
export function AddVocabularyForm() {
  const [state, action] = useActionState<VocabularyAddState, FormData>(addVocabularyAction, {});
  const form = useRef<HTMLFormElement>(null);

  // After each answer of the server: on the first field in error, or back to
  // the first field, ready for the next item.
  useEffect(() => {
    if (!state.added && !state.fieldErrors) return;
    const target =
      form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]') ??
      form.current?.elements.namedItem('word');
    (target as HTMLInputElement | null)?.focus();
  }, [state]);

  const values = state.values ?? EMPTY;

  return (
    <form ref={form} action={action} className="add-form" noValidate>
      {state.added && (
        <p className="notice" role="status">
          <em lang="en">{state.added.word}</em> ajouté, à apprendre.
        </p>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <VocabularyFields values={values} errors={state.fieldErrors} idPrefix="add" autoFocus />
      <div className="add-form__actions">
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
