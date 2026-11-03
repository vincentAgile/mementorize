'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { CatalogEntry } from '../../../../../lib/admin-api';
import { closeDialog, SubmitButton } from '../../../../lists/row-actions';
import { VocabularyFields, type VocabularyValues } from '../../../../anglais/vocabulary-fields';
import { type EntryFormState, saveEntryAction } from './actions';

const EMPTY: VocabularyValues = { word: '', example: '', translation: '', frenchExample: '', topic: '' };

const valuesOf = (entry: CatalogEntry): VocabularyValues => ({
  word: entry.english,
  example: entry.englishExample ?? '',
  translation: entry.french,
  frenchExample: entry.frenchExample ?? '',
  topic: entry.topic ?? '',
});

/**
 * MEM-117: the form of a word of a predefined list, with the fields of the
 * vocabulary of the users (VocabularyFields: Anglais, Français, Thématique),
 * their checks and translate buttons. Without `entry`, the form « Ajouter un
 * mot » of the page, made to add several in a row: the cursor back in the
 * first field, the topic kept, the word just added recalled. With it, the
 * form of « Modifier », in its dialog, closed once saved.
 */
export function EntryForm({
  listId,
  entry,
  topics,
  idPrefix,
}: {
  listId: string;
  entry?: CatalogEntry;
  topics: string[];
  idPrefix: string;
}) {
  // Each answer numbered: the fields are built again from it (React resets an uncontrolled form after an action).
  const [state, action] = useActionState<EntryFormState & { version?: number }, FormData>(
    async (previous, formData) => ({
      ...(await saveEntryAction(listId, entry?.id ?? null, previous, formData)),
      version: (previous.version ?? 0) + 1,
    }),
    {},
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.version) return;
    if (state.saved && entry) {
      closeDialog(form.current);
      return;
    }
    const target =
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      (form.current?.elements.namedItem('word') as HTMLInputElement | null);
    target?.focus();
  }, [state, entry]);

  const values =
    state.values ?? (entry ? valuesOf(entry) : state.saved ? { ...EMPTY, topic: state.saved.topic } : EMPTY);

  return (
    <form
      key={state.version ?? 0}
      ref={form}
      action={action}
      className={entry ? 'dialog__form entry-form' : 'add-form entry-form'}
      noValidate
    >
      {!entry && state.saved && (
        <p className="notice" role="status">
          <em lang="en">{state.saved.word}</em> ajouté à la fin de la liste.
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
        idPrefix={idPrefix}
        autoFocus={Boolean(entry)}
        translator="DeepL"
        topics={topics}
      />
      {entry ? (
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => closeDialog(form.current)}>
            Annuler
          </button>
          <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
        </div>
      ) : (
        <div className="add-form__actions">
          <AddButton />
        </div>
      )}
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
