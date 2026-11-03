'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { CatalogEntry } from '../../../../../lib/admin-api';
import { wordCount } from '../../../../../lib/catalog';
import { NBSP } from '../../../../../lib/format';
import { useSelection } from '../../../../lists/use-selection';
import { SubmitButton } from '../../../../lists/row-actions';
import { type DeleteEntriesResult, type DeleteEntryState, deleteEntriesAction, deleteEntryAction } from './actions';
import { EntryForm } from './entry-form';

/**
 * MEM-117: the words of a predefined list, in the order of the list:
 * Expression française, Expression anglaise, Thématique, and their actions,
 * Modifier (the example sentences too) and Supprimer, each in a modal dialog.
 * A box per word, and one in the header for them all: the words checked are
 * deleted at once, after a confirmation (SelectionBar).
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
  return <Words listId={listId} entries={entries} topics={topics} />;
}

function Words({ listId, entries, topics }: { listId: string; entries: CatalogEntry[]; topics: string[] }) {
  const allIds = entries.map((entry) => entry.id);
  const selection = useSelection(allIds, allIds);
  const { ids, isSelected, pageAll, headerBox, toggleRow, togglePage } = selection;
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);

  return (
    <>
      {message && (
        <p
          className={message.kind === 'done' ? 'notice' : 'form-error'}
          role={message.kind === 'done' ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}
      {ids.length > 0 && (
        <SelectionBar
          listId={listId}
          ids={ids}
          onClear={selection.clear}
          onDone={(result) => {
            if ('deleted' in result) {
              selection.clear();
              setMessage({
                kind: 'done',
                text: `${wordCount(result.deleted)} supprimé${result.deleted > 1 ? 's' : ''}.`,
              });
            } else setMessage({ kind: 'error', text: result.error });
          }}
        />
      )}
      <div className="item-list__scroll">
        <table className="item-list__table catalog__table entries-table">
          <thead>
            <tr>
              <th scope="col" className="item-list__select">
                <label className="select-box">
                  <input ref={headerBox} type="checkbox" checked={pageAll} onChange={togglePage} />
                  <span className="visually-hidden">Sélectionner tous les mots</span>
                </label>
              </th>
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
              <tr key={entry.id} className={isSelected(entry.id) ? 'is-selected' : undefined}>
                <td className="item-list__select">
                  <label className="select-box">
                    <input type="checkbox" checked={isSelected(entry.id)} onChange={() => toggleRow(entry.id)} />
                    <span className="visually-hidden">Sélectionner « {entry.english} »</span>
                  </label>
                </td>
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
    </>
  );
}

/** Above the table as soon as a word is checked: how many, « Supprimer » (confirmed first), « Annuler la sélection ». */
function SelectionBar({
  listId,
  ids,
  onClear,
  onDone,
}: {
  listId: string;
  ids: string[];
  onClear: () => void;
  onDone: (result: DeleteEntriesResult) => void;
}) {
  const confirm = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const count = ids.length;
  const plural = count > 1 ? 's' : '';
  return (
    <div className="selection-bar" role="region" aria-label="Sélection">
      <strong aria-live="polite">
        {wordCount(count)} sélectionné{plural}
      </strong>
      <span aria-hidden="true"> · </span>
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

      <dialog ref={confirm} className="dialog" aria-labelledby="entries-delete-title">
        <h2 id="entries-delete-title">
          Supprimer {count > 1 ? `les ${wordCount(count)} sélectionnés` : 'le mot sélectionné'}
          {NBSP}?
        </h2>
        <p className="dialog__hint">
          {count > 1 ? 'Ils sont retirés' : 'Il est retiré'} de la liste. Les vocabulaires des utilisateurs ne changent
          pas : les mots qu’ils en ont ajoutés restent les leurs.
        </p>
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => confirm.current?.close()}>
            Annuler
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              confirm.current?.close();
              startTransition(async () => onDone(await deleteEntriesAction(listId, ids)));
            }}
          >
            Supprimer
          </button>
        </div>
      </dialog>
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
