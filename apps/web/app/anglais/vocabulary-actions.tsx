'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { Translator } from '../../lib/types';
import type { VocabularyRow } from '../../lib/vocabulary-table';
import { closeDialog, RowActions, SubmitButton } from '../lists/row-actions';
import { VocabularyFields } from './vocabulary-fields';
import { deleteVocabularyAction, updateVocabularyAction } from './actions';

/**
 * The actions of a row of the vocabulary table: into the learning queue or
 * out of it (MEM-63), back in learning (MEM-22), modify (MEM-19) and delete
 * (MEM-20). The buttons and dialogs are those of every list (RowActions).
 */
export function VocabularyActions({
  row,
  translator,
  topics,
  queueMenu,
  advanced = false,
}: {
  row: VocabularyRow;
  translator: Translator;
  topics: string[];
  /** MEM-111: the mode of use is Avancé: « Réinitialiser l’apprentissage ». */
  advanced?: boolean;
  /** MEM-64: where to move an item of the learning queue (built by the table). */
  queueMenu?: React.ReactNode;
}) {
  return (
    <RowActions
      type="Vocabulary"
      row={row}
      name={row.english}
      queue
      queueMenu={queueMenu}
      relearn={{ title: 'Remettre en apprentissage', label: `Remettre « ${row.english} » en apprentissage` }}
      advanced={advanced}
      editTitle="Modifier l’élément"
      editForm={<EditForm row={row} translator={translator} topics={topics} />}
      deleteTitle="Supprimer l’élément ?"
      deletePreview={
        <p>
          <strong lang="en">{row.english}</strong> → {row.french}
        </p>
      }
      deleteHint="Il disparaît de la liste et de la révision, avec tout son historique."
      deleteAction={deleteVocabularyAction.bind(null, row.id)}
    />
  );
}

function EditForm({ row, translator, topics }: { row: VocabularyRow; translator: Translator; topics: string[] }) {
  const [state, action] = useActionState(updateVocabularyAction.bind(null, row.id), {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) closeDialog(form.current);
  }, [state]);

  const values = state.values ?? {
    word: row.english,
    translation: row.french,
    example: row.example ?? '',
    frenchExample: row.frenchExample ?? '',
    topic: row.topic ?? '',
  };

  return (
    <form ref={form} action={action} className="dialog__form">
      <VocabularyFields values={values} idPrefix={`edit-${row.id}`} translator={translator} topics={topics} />
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="dialog__buttons">
        <button type="button" className="button--secondary" onClick={() => closeDialog(form.current)}>
          Annuler
        </button>
        <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
      </div>
    </form>
  );
}
