'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { Translator } from '../../../lib/types';
import { addVocabularyAction, type VocabularyAddState } from '../actions';
import { VocabularyFields, type VocabularyValues } from '../vocabulary-fields';

const EMPTY: VocabularyValues = { word: '', example: '', translation: '', frenchExample: '', topic: '' };

/**
 * The form of the "Ajouter" tab (MEM-27), in two blocks, Anglais and
 * Français (MEM-43), made to add several items in a row: the cursor starts
 * in the first field and comes back to it after each item, a message
 * recalls the item just added, and errors show next to their field
 * (aria-invalid, aria-describedby). The topic stays after an item is
 * added, for the next items of the same subject (MEM-51), and so does the
 * choice of the learning queue (MEM-62), checked when the tab opens.
 */
export function AddVocabularyForm({ translator, topics }: { translator: Translator; topics: string[] }) {
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

  const values = state.values ?? (state.added ? { ...EMPTY, topic: state.added.topic } : EMPTY);
  const queue = state.added?.queue ?? state.queue ?? true;

  return (
    <form ref={form} action={action} className="add-form" noValidate>
      {state.added && (
        <p className="notice" role="status">
          <em lang="en">{state.added.word}</em> ajouté,{' '}
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

      <VocabularyFields
        values={values}
        errors={state.fieldErrors}
        idPrefix="add"
        autoFocus
        translator={translator}
        topics={topics}
      />
      <div className="add-form__actions">
        {/* MEM-62: the key puts the box back as chosen after the form is reset. */}
        <label key={String(queue)} className="add-form__queue">
          <input type="checkbox" name="queue" defaultChecked={queue} />
          Ajouter à la file d’apprentissage (en dernière position)
        </label>
        <AddButton />
      </div>
    </form>
  );
}

/** 1ᵉʳ, 2ᵉ, 12ᵉ: the place in the learning queue. */
function ordinal(position: number) {
  return (
    <>
      {position}
      <sup>{position === 1 ? 'er' : 'e'}</sup>
    </>
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
