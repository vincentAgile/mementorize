'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { addVocabularyAction, type VocabularyAddState } from '../actions';

type Field = 'word' | 'translation' | 'example';

/**
 * The form of the "Ajouter" tab (MEM-27), made to add several items in a
 * row: the cursor starts in the first field and comes back to it after each
 * item, a message recalls the item just added, and errors show next to
 * their field (aria-invalid, aria-describedby).
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

  const value = (name: Field) => state.values?.[name] ?? '';
  const invalid = (name: Field) => (state.fieldErrors?.[name] ? true : undefined);
  const errorId = (name: Field) => (state.fieldErrors?.[name] ? `${name}-error` : undefined);
  const error = (name: Field) =>
    state.fieldErrors?.[name] && (
      <span id={`${name}-error`} className="field-error">
        {state.fieldErrors[name]}
      </span>
    );

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

      <label>
        Anglais
        <input
          name="word"
          lang="en"
          placeholder="Mot, expression ou phrase"
          defaultValue={value('word')}
          maxLength={200}
          autoFocus
          aria-invalid={invalid('word')}
          aria-describedby={errorId('word')}
        />
        {error('word')}
      </label>
      <label>
        Français
        <input
          name="translation"
          placeholder="Traduction"
          defaultValue={value('translation')}
          maxLength={200}
          aria-invalid={invalid('translation')}
          aria-describedby={errorId('translation')}
        />
        {error('translation')}
      </label>
      <label>
        <span>
          Phrase d’exemple <span className="add-form__optional">(optionnel)</span>
        </span>
        <input
          name="example"
          lang="en"
          placeholder="Une phrase qui l’emploie"
          defaultValue={value('example')}
          maxLength={500}
          aria-invalid={invalid('example')}
          aria-describedby={errorId('example')}
        />
        {error('example')}
      </label>
      <AddButton />
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
