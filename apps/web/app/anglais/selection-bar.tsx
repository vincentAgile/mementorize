'use client';

import { useRef, useTransition } from 'react';
import { NBSP } from '../../lib/format';
import { deleteVocabularyItemsAction, queueItemsAction } from './actions';

const items = (count: number) => `${count}${NBSP}élément${count > 1 ? 's' : ''}`;

interface SelectionBarProps {
  /** The ids to delete: those checked, or all those of the search and filters. */
  ids: string[];
  onClear: () => void;
  /** After the deletion: how many items were deleted (null: it failed). */
  onDeleted: (count: number | null) => void;
  /** MEM-63: after « Ajouter à la file » or « Retirer de la file ». */
  onQueued: (op: 'add' | 'remove', result: { changed: number; ignored: number } | null) => void;
}

/**
 * MEM-59: above the table as soon as an item is checked. « Supprimer » asks
 * for a confirmation, then deletes them all in a single request.
 */
export function SelectionBar({ ids, onClear, onDeleted, onQueued }: SelectionBarProps) {
  const confirm = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const count = ids.length;

  function queue(op: 'add' | 'remove') {
    startTransition(async () => onQueued(op, await queueItemsAction(op, ids)));
  }

  function remove() {
    confirm.current?.close();
    startTransition(async () => onDeleted(await deleteVocabularyItemsAction(ids)));
  }

  return (
    <div className="selection-bar" role="region" aria-label="Sélection">
      <strong aria-live="polite">
        {items(count)} sélectionné{count > 1 ? 's' : ''}
      </strong>
      <span aria-hidden="true"> · </span>
      {/* MEM-63: in the order of the list; the items in another state are ignored. */}
      <button type="button" className="selection-bar__action" disabled={pending} onClick={() => queue('add')}>
        Ajouter à la file
      </button>
      <button type="button" className="selection-bar__action" disabled={pending} onClick={() => queue('remove')}>
        Retirer de la file
      </button>
      <button
        type="button"
        className="selection-bar__delete"
        disabled={pending}
        onClick={() => confirm.current?.showModal()}
      >
        {pending ? 'Suppression…' : 'Supprimer'}
      </button>
      <span aria-hidden="true"> · </span>
      <button type="button" className="link-button" disabled={pending} onClick={onClear}>
        Annuler la sélection
      </button>

      <dialog ref={confirm} className="dialog" aria-labelledby="bulk-delete-title">
        <h3 id="bulk-delete-title">
          Supprimer {count > 1 ? `${items(count)} de vocabulaire` : 'l’élément de vocabulaire'}
          {NBSP}?
        </h3>
        <p className="dialog__hint">
          {count > 1 ? 'Leur' : 'Son'} historique de révision sera aussi supprimé. Cette action est définitive.
        </p>
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => confirm.current?.close()}>
            Annuler
          </button>
          <button type="button" className="danger-button" onClick={remove}>
            Supprimer
          </button>
        </div>
      </dialog>
    </div>
  );
}
