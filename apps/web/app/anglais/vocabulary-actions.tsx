'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { VocabularyRow } from '../../lib/vocabulary-table';
import { deleteVocabularyAction, updateVocabularyAction } from './actions';

/**
 * The actions of a row of the vocabulary table: modify (MEM-19) and delete
 * (MEM-20). Each one opens a modal <dialog>: Escape or "Annuler" close it,
 * and the browser keeps the focus inside while it is open.
 */
export function VocabularyActions({ row }: { row: VocabularyRow }) {
  const editRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  // A new key each time the edit dialog opens: the form starts again from the saved values.
  const [editKey, setEditKey] = useState(0);

  return (
    <div className="row-actions">
      <button
        type="button"
        className="row-actions__icon"
        aria-label={`Modifier « ${row.english} »`}
        title="Modifier"
        onClick={() => {
          setEditKey((key) => key + 1);
          editRef.current?.showModal();
        }}
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        className="row-actions__icon row-actions__danger"
        aria-label={`Supprimer « ${row.english} »`}
        title="Supprimer"
        onClick={() => deleteRef.current?.showModal()}
      >
        <TrashIcon />
      </button>

      <dialog ref={editRef} className="dialog" aria-labelledby={`edit-${row.id}`}>
        <h3 id={`edit-${row.id}`}>Modifier l’élément</h3>
        <EditForm key={editKey} row={row} close={() => editRef.current?.close()} />
      </dialog>

      <dialog ref={deleteRef} className="dialog" aria-labelledby={`delete-${row.id}`}>
        <h3 id={`delete-${row.id}`}>Supprimer l’élément ?</h3>
        <p>
          <strong lang="en">{row.english}</strong> → {row.french}
        </p>
        <p className="dialog__hint">Il disparaît de la liste et de la révision, avec tout son historique.</p>
        <form action={deleteVocabularyAction.bind(null, row.id)} className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => deleteRef.current?.close()}>
            Annuler
          </button>
          <SubmitButton label="Supprimer" pendingLabel="Suppression…" className="danger-button" />
        </form>
      </dialog>
    </div>
  );
}

function EditForm({ row, close }: { row: VocabularyRow; close: () => void }) {
  const [state, action] = useActionState(updateVocabularyAction.bind(null, row.id), {});

  useEffect(() => {
    if (state.saved) close();
  }, [state, close]);

  const values = state.values ?? { word: row.english, translation: row.french, example: row.example ?? '' };

  return (
    <form action={action} className="dialog__form">
      <label>
        Anglais
        <input name="word" defaultValue={values.word} maxLength={200} required lang="en" />
      </label>
      <label>
        Français
        <input name="translation" defaultValue={values.translation} maxLength={200} required />
      </label>
      <label>
        Phrase d’exemple (optionnel)
        <input name="example" defaultValue={values.example} maxLength={500} lang="en" />
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="dialog__buttons">
        <button type="button" className="button--secondary" onClick={close}>
          Annuler
        </button>
        <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
      </div>
    </form>
  );
}

function SubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className ?? 'button--primary'} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

const ICON = {
  viewBox: '0 0 24 24',
  width: 17,
  height: 17,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function PencilIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}
