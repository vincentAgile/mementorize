'use client';

import { Fragment, type ReactNode, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ListRow } from '../../lib/item-list';
import type { ListType } from '../../lib/types';
import { queueRowAction, relearnAction, resetLearningAction } from './actions';

/**
 * The actions of a row of a list, the vocabulary (MEM-19, MEM-20, MEM-22,
 * MEM-63) or the quotes (MEM-69, MEM-70): into the learning queue or out of
 * it, back in the review, modify and delete. Modify and delete open a modal
 * <dialog>: Escape or "Annuler" close it, and the browser keeps the focus
 * inside while it is open. What differs from one space to the other (the
 * fields, the wording) is given by the space.
 */
export function RowActions({
  type,
  row,
  name,
  queue,
  queueMenu,
  relearn,
  advanced = false,
  editTitle,
  editForm,
  deleteTitle,
  deletePreview,
  deleteHint,
  deleteAction,
}: {
  type: ListType;
  row: ListRow;
  /** How the item is named to screen readers: « Modifier « snag » ». */
  name: string;
  /** The buttons into and out of the learning queue (MEM-63). */
  queue: boolean;
  /** MEM-64: where to move an item of the learning queue (built by the table). */
  queueMenu?: ReactNode;
  /**
   * Back in the review: « Remettre en apprentissage » a word, « Remettre en
   * révision » a quote; `label` names the item for screen readers.
   */
  relearn: { title: string; label: string };
  /** MEM-111: the mode of use is Avancé (MEM-110): « Réinitialiser l’apprentissage », whatever the state. */
  advanced?: boolean;
  editTitle: string;
  /**
   * The edit form, started again from the saved values each time the dialog
   * opens; it closes its dialog itself (closeDialog).
   */
  editForm: ReactNode;
  deleteTitle: string;
  deletePreview: ReactNode;
  deleteHint: string;
  deleteAction: () => Promise<void>;
}) {
  const editRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const resetRef = useRef<HTMLDialogElement>(null);
  // A new key each time the edit dialog opens: the form starts again from the saved values.
  const [editKey, setEditKey] = useState(0);

  return (
    <div className="row-actions">
      {queue && queueMenu}
      {queue && row.status === 'Waiting' && (
        // MEM-63: last in the learning queue.
        <form action={queueRowAction.bind(null, type, 'add', row.id)}>
          <IconSubmit label={`Ajouter « ${name} » à la file d’apprentissage`} title="Ajouter à la file d’apprentissage">
            <QueueAddIcon />
          </IconSubmit>
        </form>
      )}
      {queue && row.status === 'ToLearn' && (
        // MEM-63: back "En attente"; the next ones of the queue move up.
        <form action={queueRowAction.bind(null, type, 'remove', row.id)}>
          <IconSubmit label={`Retirer « ${name} » de la file d’apprentissage`} title="Retirer de la file">
            <QueueRemoveIcon />
          </IconSubmit>
        </form>
      )}
      {row.status === 'Learned' && (
        // MEM-22: back in the review, with its previous schedule.
        <form action={relearnAction.bind(null, row.id)}>
          <IconSubmit label={relearn.label} title={relearn.title}>
            <RelearnIcon />
          </IconSubmit>
        </form>
      )}
      {advanced && (
        // MEM-111: the learning from scratch, after a confirmation.
        <button
          type="button"
          className="row-actions__icon"
          aria-label={`Réinitialiser l’apprentissage de « ${name} »`}
          title="Réinitialiser l’apprentissage"
          onClick={() => resetRef.current?.showModal()}
        >
          <ResetIcon />
        </button>
      )}
      <button
        type="button"
        className="row-actions__icon"
        aria-label={`Modifier « ${name} »`}
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
        aria-label={`Supprimer « ${name} »`}
        title="Supprimer"
        onClick={() => deleteRef.current?.showModal()}
      >
        <TrashIcon />
      </button>

      <dialog ref={editRef} className="dialog dialog--wide" aria-labelledby={`edit-${row.id}`}>
        <h3 id={`edit-${row.id}`}>{editTitle}</h3>
        <Fragment key={editKey}>{editForm}</Fragment>
      </dialog>

      {advanced && (
        <dialog ref={resetRef} className="dialog" aria-labelledby={`reset-${row.id}`}>
          <h3 id={`reset-${row.id}`}>Réinitialiser l’apprentissage de «&nbsp;{name}&nbsp;» ?</h3>
          <p className="dialog__hint">
            L’élément repasse en «&nbsp;À apprendre&nbsp;» et ses cartes repartent de zéro. L’historique de révisions
            est conservé.
          </p>
          <form
            // The row stays (unlike a deletion): the dialog closes once the list is rendered again.
            action={async () => {
              await resetLearningAction(row.id);
              resetRef.current?.close();
            }}
            className="dialog__buttons"
          >
            <button type="button" className="button--secondary" onClick={() => resetRef.current?.close()}>
              Annuler
            </button>
            <SubmitButton label="Réinitialiser" pendingLabel="Réinitialisation…" />
          </form>
        </dialog>
      )}

      <dialog ref={deleteRef} className="dialog" aria-labelledby={`delete-${row.id}`}>
        <h3 id={`delete-${row.id}`}>{deleteTitle}</h3>
        {deletePreview}
        <p className="dialog__hint">{deleteHint}</p>
        <form action={deleteAction} className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => deleteRef.current?.close()}>
            Annuler
          </button>
          <SubmitButton label="Supprimer" pendingLabel="Suppression…" className="danger-button" />
        </form>
      </dialog>
    </div>
  );
}

/** Closes the dialog an element is in: « Annuler », or a form once saved. */
export function closeDialog(element: Element | null) {
  element?.closest('dialog')?.close();
}

export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className ?? 'button--primary'} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export const ICON = {
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

/** An icon button that submits its form, disabled while it is sent. */
function IconSubmit({ label, title, children }: { label: string; title: string; children: ReactNode }) {
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

/** MEM-111: back to the start (a bar, an arrow towards it). */
function ResetIcon() {
  return (
    <svg {...ICON}>
      <path d="M6 5v14" />
      <path d="M18 6 10 12l8 6z" />
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

export function TrashIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}
