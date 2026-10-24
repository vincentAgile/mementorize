'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Translator } from '../../lib/types';
import type { VocabularyRow } from '../../lib/vocabulary-table';
import { VocabularyFields } from './vocabulary-fields';
import { deleteVocabularyAction, queueRowAction, relearnAction, updateVocabularyAction } from './actions';

/**
 * The actions of a row of the vocabulary table: into the learning queue or
 * out of it (MEM-63), back in learning (MEM-22), modify (MEM-19) and delete
 * (MEM-20). Each one opens a modal <dialog>: Escape or "Annuler" close it,
 * and the browser keeps the focus inside while it is open.
 */
export function VocabularyActions({
  row,
  translator,
  topics,
}: {
  row: VocabularyRow;
  translator: Translator;
  topics: string[];
}) {
  const editRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  // A new key each time the edit dialog opens: the form starts again from the saved values.
  const [editKey, setEditKey] = useState(0);

  return (
    <div className="row-actions">
      {row.status === 'Waiting' && (
        // MEM-63: last in the learning queue.
        <form action={queueRowAction.bind(null, 'add', row.id)}>
          <IconSubmit
            label={`Ajouter « ${row.english} » à la file d’apprentissage`}
            title="Ajouter à la file d’apprentissage"
          >
            <QueueAddIcon />
          </IconSubmit>
        </form>
      )}
      {row.status === 'ToLearn' && (
        // MEM-63: back "En attente"; the next ones of the queue move up.
        <form action={queueRowAction.bind(null, 'remove', row.id)}>
          <IconSubmit label={`Retirer « ${row.english} » de la file d’apprentissage`} title="Retirer de la file">
            <QueueRemoveIcon />
          </IconSubmit>
        </form>
      )}
      {row.status === 'Learned' && (
        // MEM-22: back in the review, with its previous schedule.
        <form action={relearnAction.bind(null, row.id)}>
          <RelearnButton english={row.english} />
        </form>
      )}
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

      <dialog ref={editRef} className="dialog dialog--wide" aria-labelledby={`edit-${row.id}`}>
        <h3 id={`edit-${row.id}`}>Modifier l’élément</h3>
        <EditForm
          key={editKey}
          row={row}
          close={() => editRef.current?.close()}
          translator={translator}
          topics={topics}
        />
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

function EditForm({
  row,
  close,
  translator,
  topics,
}: {
  row: VocabularyRow;
  close: () => void;
  translator: Translator;
  topics: string[];
}) {
  const [state, action] = useActionState(updateVocabularyAction.bind(null, row.id), {});

  useEffect(() => {
    if (state.saved) close();
  }, [state, close]);

  const values = state.values ?? {
    word: row.english,
    translation: row.french,
    example: row.example ?? '',
    frenchExample: row.frenchExample ?? '',
    topic: row.topic ?? '',
  };

  return (
    <form action={action} className="dialog__form">
      <VocabularyFields values={values} idPrefix={`edit-${row.id}`} translator={translator} topics={topics} />
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

function RelearnButton({ english }: { english: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="row-actions__icon"
      aria-label={`Remettre « ${english} » en apprentissage`}
      title="Remettre en apprentissage"
      disabled={pending}
    >
      <RelearnIcon />
    </button>
  );
}

/** An icon button that submits its form, disabled while it is sent. */
function IconSubmit({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="row-actions__icon" aria-label={label} title={title} disabled={pending}>
      {children}
    </button>
  );
}

/** A list with a plus: into the learning queue (MEM-63). */
function QueueAddIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 6h10M4 12h10M4 18h6" />
      <path d="M18 14v6M15 17h6" />
    </svg>
  );
}

/** A list with a minus: out of the learning queue (MEM-63). */
function QueueRemoveIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 6h10M4 12h10M4 18h6" />
      <path d="M15 17h6" />
    </svg>
  );
}

function RelearnIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </svg>
  );
}

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
