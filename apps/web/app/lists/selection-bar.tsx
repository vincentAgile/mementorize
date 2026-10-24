'use client';

import { useRef, useTransition } from 'react';
import { NNBSP } from '../../lib/format';
import { agree, countOf, type Noun } from '../../lib/nouns';
import type { ListType } from '../../lib/types';
import { deleteItemsAction, queueItemsAction } from './actions';

interface SelectionBarProps {
  type: ListType;
  noun: Noun;
  /** The ids selected: those checked, or all those of the search and filters. */
  ids: string[];
  /** The actions on the learning queue (MEM-63, MEM-64). */
  queue: boolean;
  /** « Supprimer 3 éléments de vocabulaire ? », « Supprimer la citation ? » */
  deleteTitle: (count: number) => string;
  onClear: () => void;
  /** After the deletion: how many items were deleted (null: it failed). */
  onDeleted: (count: number | null) => void;
  /** MEM-63: after « Ajouter à la file », « Retirer de la file » or « Placer en tête de file ». */
  onQueued: (op: 'add' | 'remove' | 'top', result: { changed: number; ignored: number } | null) => void;
}

/**
 * MEM-59: above the table as soon as an item is checked. « Supprimer » asks
 * for a confirmation, then deletes them all in a single request. The
 * actions on the learning queue go in a single request too.
 */
export function SelectionBar({ type, noun, ids, queue, deleteTitle, onClear, onDeleted, onQueued }: SelectionBarProps) {
  const confirm = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const count = ids.length;

  function changeQueue(op: 'add' | 'remove' | 'top') {
    startTransition(async () => onQueued(op, await queueItemsAction(type, op, ids)));
  }

  function remove() {
    confirm.current?.close();
    startTransition(async () => onDeleted(await deleteItemsAction(type, ids)));
  }

  return (
    <div className="selection-bar" role="region" aria-label="Sélection">
      <strong aria-live="polite">
        {countOf(count, noun)} {agree('sélectionné', noun, count)}
      </strong>
      <span aria-hidden="true"> · </span>
      {queue && (
        <>
          {/* MEM-63: in the order of the list; the items in another state are ignored. */}
          <button type="button" className="selection-bar__action" disabled={pending} onClick={() => changeQueue('add')}>
            Ajouter à la file
          </button>
          <button
            type="button"
            className="selection-bar__action"
            disabled={pending}
            onClick={() => changeQueue('remove')}
          >
            Retirer de la file
          </button>
          {/* MEM-64: the items "À apprendre" selected, in their order in the queue. */}
          <button type="button" className="selection-bar__action" disabled={pending} onClick={() => changeQueue('top')}>
            Placer en tête de file
          </button>
        </>
      )}
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
          {deleteTitle(count)}
          {NNBSP}?
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
