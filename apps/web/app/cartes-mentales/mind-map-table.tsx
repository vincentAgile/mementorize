'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { NBSP, shortDate } from '../../lib/format';
import {
  type Filter,
  filterRows,
  isFiltered,
  NO_FILTER,
  nextSort,
  reviewLabel,
  type Sort,
  sortRows,
} from '../../lib/item-list';
import { DEFAULT_MIND_MAP_SORT, matchesMindMap, MIND_MAP_SORTS, type MindMapRow } from '../../lib/mind-map-table';
import { agree, countOf, type Noun } from '../../lib/nouns';
import { savePageSizeAction } from '../lists/actions';
import { ListFilters, SortHeader } from '../lists/list-filters';
import { Pagination } from '../lists/pagination';
import { ICON, SubmitButton, TrashIcon } from '../lists/row-actions';
import { SelectionBar } from '../lists/selection-bar';
import { SelectAllNotice, useSelection } from '../lists/use-selection';
import { deleteMindMapFromListAction } from './actions';

/** « 3 cartes sur 12 »: the short name, in the counters of the list. */
const NOUN: Noun = { one: 'carte', many: 'cartes', feminine: true };

const COLUMNS = [
  { key: 'topic', label: 'Sujet' },
  { key: 'branches', label: 'Branches' },
  { key: 'ideas', label: 'Idées' },
  { key: 'learned', label: 'Apprises', title: 'Branches apprises, hors révision' },
  { key: 'review', label: 'Révision' },
  { key: 'created', label: 'Créée le' },
];

const deleteTitle = (count: number) =>
  count > 1 ? `Supprimer ${count} cartes mentales` : 'Supprimer la carte mentale';

/**
 * The tab « Liste » of the Cartes mentales space (MEM-98): the maps as a
 * table, as the lists of the other spaces (MEM-16 to MEM-18, MEM-58,
 * MEM-59): sorted by a click on a column, the most recent first by default;
 * a search in the topic and the ideas; pages; « Ouvrir » and « Supprimer »
 * on each row, and the deletion of a selection. Everything happens in the
 * browser; the state survives the refresh after a deletion.
 */
export function MindMapTable({
  rows,
  now,
  pageSize: initialPageSize,
}: {
  rows: MindMapRow[];
  now: string;
  pageSize: number;
}) {
  const [sort, setSortState] = useState<Sort>(DEFAULT_MIND_MAP_SORT);
  const [filter, setFilterState] = useState<Filter>(NO_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | undefined>(undefined);

  const shown = useMemo(
    () => sortRows(filterRows(rows, filter, matchesMindMap), sort, MIND_MAP_SORTS),
    [rows, filter, sort],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);
  const selection = useSelection(
    shown.map((row) => row.id),
    pageRows.map((row) => row.id),
  );
  const { isSelected, pageAll, headerBox, toggleRow, togglePage } = selection;

  // A new search clears the selection: never delete maps no longer in view.
  const setFilter = (next: Filter) => {
    setFilterState(next);
    setPage(1);
    selection.clear();
    setNotice(undefined);
  };
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
    void savePageSizeAction(size);
  };

  const date = new Date(now);
  const filtered = isFiltered(filter);

  return (
    <section className="item-list" aria-label="Mes cartes mentales">
      <ListFilters
        filter={filter}
        onChange={setFilter}
        searchLabel="Rechercher dans les sujets et les idées"
        statuses={[]}
      />

      <p className="item-list__count">
        <span aria-live="polite">
          {filtered ? `${countOf(shown.length, NOUN)} sur ${rows.length}` : countOf(rows.length, NOUN)}
        </span>
        {filtered && shown.length > 0 && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
              Effacer la recherche
            </button>
          </>
        )}
      </p>

      {notice && (
        <p className={notice.ok ? 'notice' : 'form-error'} role="status">
          {notice.text}
        </p>
      )}

      {selection.ids.length > 0 && (
        <SelectionBar
          type="MindMap"
          noun={NOUN}
          ids={selection.ids}
          queue={false}
          deleteTitle={deleteTitle}
          onClear={selection.clear}
          onDeleted={(count) => {
            setNotice(
              count === null
                ? { ok: false, text: 'La suppression a échoué : rien n’a été supprimé. Réessaie.' }
                : { ok: true, text: `${countOf(count, NOUN)} ${agree('supprimé', NOUN, count)}.` },
            );
            if (count !== null) selection.clear();
          }}
          onQueued={() => undefined}
        />
      )}

      <SelectAllNotice
        selection={selection}
        noun={NOUN}
        shownCount={shown.length}
        pageCount={pageRows.length}
        filtered={filtered}
      />

      {shown.length === 0 ? (
        <p className="item-list__none">
          Aucune carte ne correspond à cette recherche.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
            Effacer la recherche
          </button>
        </p>
      ) : (
        <div className="item-list__scroll">
          <table className="item-list__table item-list__table--MindMap">
            <thead>
              <tr>
                <th scope="col" className="item-list__select">
                  <label className="select-box">
                    <input ref={headerBox} type="checkbox" checked={pageAll} onChange={togglePage} />
                    <span className="visually-hidden">Sélectionner les cartes de la page</span>
                  </label>
                </th>
                {COLUMNS.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    order={sort}
                    onSort={(key) => {
                      setSortState(nextSort(sort, key));
                      setPage(1);
                    }}
                  />
                ))}
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className={isSelected(row.id) ? 'is-selected' : undefined}>
                  <td className="item-list__select">
                    <label className="select-box">
                      <input type="checkbox" checked={isSelected(row.id)} onChange={() => toggleRow(row.id)} />
                      <span className="visually-hidden">Sélectionner « {row.topic} »</span>
                    </label>
                  </td>
                  <td>
                    <Link href={`/mind-maps/${row.id}`} className="item-list__main">
                      {row.topic}
                    </Link>
                  </td>
                  <td className="item-list__number">{row.branches}</td>
                  <td className="item-list__number">{row.ideas}</td>
                  <td className="item-list__number">
                    {row.learned}
                    {NBSP}/{NBSP}
                    {row.branches}
                  </td>
                  <td className="item-list__review">{reviewLabel(row, date)}</td>
                  <td className="item-list__date">{shortDate(new Date(row.createdAt).toISOString())}</td>
                  <td>
                    <MindMapActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && (
        <Pagination
          noun={NOUN}
          page={current}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      )}
    </section>
  );
}

/** « Ouvrir » (the editor) and « Supprimer » (after a confirmation), as the row actions of the other lists. */
function MindMapActions({ row }: { row: MindMapRow }) {
  const deleteRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="row-actions">
      <Link
        href={`/mind-maps/${row.id}`}
        className="row-actions__icon"
        aria-label={`Ouvrir « ${row.topic} »`}
        title="Ouvrir"
      >
        <OpenIcon />
      </Link>
      <button
        type="button"
        className="row-actions__icon row-actions__danger"
        aria-label={`Supprimer « ${row.topic} »`}
        title="Supprimer"
        onClick={() => deleteRef.current?.showModal()}
      >
        <TrashIcon />
      </button>
      <dialog ref={deleteRef} className="dialog" aria-labelledby={`delete-${row.id}`}>
        <h3 id={`delete-${row.id}`}>Supprimer la carte mentale ?</h3>
        <p className="dialog__preview">{row.topic}</p>
        <p className="dialog__hint">Son historique de révision sera aussi supprimé. Cette action est définitive.</p>
        <form action={deleteMindMapFromListAction.bind(null, row.id)} className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => deleteRef.current?.close()}>
            Annuler
          </button>
          <SubmitButton label="Supprimer" pendingLabel="Suppression…" className="danger-button" />
        </form>
      </dialog>
    </div>
  );
}

/** A pencil would say « modify »: an arrow out of a box, to open the editor. */
function OpenIcon() {
  return (
    <svg {...ICON}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
