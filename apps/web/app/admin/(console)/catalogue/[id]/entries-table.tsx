'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { CatalogEntry } from '../../../../../lib/admin-api';
import { NBSP } from '../../../../../lib/format';
import { SubmitButton } from '../../../../lists/row-actions';
import { type DeleteEntryState, deleteEntryAction } from './actions';
import { EntryForm } from './entry-form';

/**
 * MEM-117: the words of a predefined list, in the order of the list:
 * Expression française, Expression anglaise, Thématique, and their actions,
 * Modifier (the example sentences too) and Supprimer, each in a modal dialog.
 */
export function EntriesTable({
  listId,
  entries,
  topics,
}: {
  listId: string;
  entries: CatalogEntry[];
  topics: string[];
}) {
  if (entries.length === 0) {
    return (
      <p className="admin__empty">
        Aucun mot pour le moment : ajoutez-en avec le formulaire ci-dessus, ou importez un fichier CSV.
      </p>
    );
  }
  return (
    <div className="item-list__scroll">
      <table className="item-list__table catalog__table entries-table">
        <thead>
          <tr>
            <th scope="col">Expression française</th>
            <th scope="col">Expression anglaise</th>
            <th scope="col">Thématique</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td lang="fr">{entry.french}</td>
              <td lang="en">{entry.english}</td>
              <td className="item-list__topic">{entry.topic}</td>
              <td>
                <EntryActions listId={listId} entry={entry} topics={topics} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Modifier and Supprimer, for one word. */
function EntryActions({ listId, entry, topics }: { listId: string; entry: CatalogEntry; topics: string[] }) {
  const edit = useRef<HTMLDialogElement>(null);
  const remove = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  const [state, deleteAction] = useActionState<DeleteEntryState & { version?: number }, FormData>(
    async (previous) => ({ ...(await deleteEntryAction(listId, entry.id)), version: (previous.version ?? 0) + 1 }),
    {},
  );
  useEffect(() => {
    if (state.version && !state.error) remove.current?.close();
  }, [state]);

  return (
    <div className="catalog__actions">
      <button
        type="button"
        className="button--secondary"
        aria-label={`Modifier « ${entry.english} »`}
        onClick={() => {
          setKey((n) => n + 1);
          edit.current?.showModal();
        }}
      >
        Modifier
      </button>
      <button
        type="button"
        className="button--secondary catalog__delete"
        aria-label={`Supprimer « ${entry.english} »`}
        onClick={() => remove.current?.showModal()}
      >
        Supprimer
      </button>

      <dialog ref={edit} className="dialog dialog--wide" aria-labelledby={`entry-edit-${entry.id}`}>
        <h2 id={`entry-edit-${entry.id}`}>Modifier le mot</h2>
        <EntryForm key={key} listId={listId} entry={entry} topics={topics} idPrefix={`entry-edit-${entry.id}`} />
      </dialog>

      <dialog ref={remove} className="dialog" aria-labelledby={`entry-delete-${entry.id}`}>
        <h2 id={`entry-delete-${entry.id}`}>
          Supprimer «{NBSP}
          <span lang="en">{entry.english}</span>
          {NBSP}» ?
        </h2>
        <p className="dialog__hint">
          Le mot est retiré de la liste. Les vocabulaires des utilisateurs ne changent pas : s’ils l’ont ajouté, il
          reste le leur.
        </p>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <form action={deleteAction} className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => remove.current?.close()}>
            Annuler
          </button>
          <SubmitButton label="Supprimer" pendingLabel="Suppression…" className="danger-button" />
        </form>
      </dialog>
    </div>
  );
}
