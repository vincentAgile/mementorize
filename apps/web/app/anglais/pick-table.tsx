'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  type Filter,
  filterRows,
  isFiltered,
  NO_FILTER,
  nextSort,
  type Sort,
  type SortSpec,
  sortRows,
  statusLabel,
} from '../../lib/item-list';
import { agree, countOf, ITEM_NOUN } from '../../lib/nouns';
import { withList } from '../../lib/session-preparation';
import type { LearningStatus } from '../../lib/types';
import { matchesVocabulary, topicsOf, VOCABULARY_SORTS, type VocabularyRow } from '../../lib/vocabulary-table';
import { savePageSizeAction } from '../lists/actions';
import { ListFilters, SortHeader } from '../lists/list-filters';
import { Pagination } from '../lists/pagination';
import { VOCABULARY_COLUMNS } from './vocabulary-table';

/** The states of the items that can be added to a session. */
const STATUSES: LearningStatus[] = ['ToLearn', 'Waiting'];

/** By default, the order of the queue, then the items « En attente », the oldest first. */
const QUEUE_ORDER: Sort = { key: 'position', direction: 'asc' };
const SORTS: Record<string, SortSpec<VocabularyRow>> = {
  ...VOCABULARY_SORTS,
  position: {
    compare: (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.createdAt - b.createdAt,
  },
};

const english = (row: VocabularyRow) => row.english;

interface PickTableProps {
  /** The items that can be added: « À apprendre » and « En attente », not already in the session. */
  rows: VocabularyRow[];
  /** The ids of the session being prepared, in its order. */
  list: string[];
  /** How many items can still be added (ten at most in a session). */
  room: number;
  /** The preparation page. */
  prepareHref: string;
  /** Items per page (MEM-58), from the account's preferences. */
  pageSize: number;
}

/**
 * MEM-95: the items to add to a learning session, chosen as in the tab
 * « Liste » (MEM-16 to MEM-18, MEM-58): the same search, filters, sort and
 * pages, but only a box per row. « Ajouter à la session » goes back to the
 * preparation page, the items checked at the end of the list, in the order
 * shown here.
 */
export function PickTable({ rows, list, room, prepareHref, pageSize: initialPageSize }: PickTableProps) {
  const router = useRouter();
  const [sort, setSortState] = useState<Sort | null>(null);
  const [filter, setFilterState] = useState<Filter>(NO_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const topics = useMemo(() => topicsOf(rows.map((row) => row.topic)), [rows]);

  const order = sort ?? QUEUE_ORDER;
  const shown = useMemo(
    () => sortRows(filterRows(rows, filter, matchesVocabulary), order, SORTS),
    [rows, filter, order],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);
  const left = room - picked.size;

  // The selection is kept through a new search, filter or sort: it is added as a whole.
  const setFilter = (next: Filter) => {
    setFilterState(next);
    setPage(1);
  };
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
    void savePageSizeAction(size);
  };
  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else if (next.size < room) next.add(id);
    setPicked(next);
  }

  /** In the order shown here; those hidden by the filters after them, in the order of the table without filter. */
  function chosenInOrder(): string[] {
    const shownIds = shown.map((row) => row.id).filter((id) => picked.has(id));
    const hidden = sortRows(rows, order, SORTS)
      .map((row) => row.id)
      .filter((id) => picked.has(id) && !shownIds.includes(id));
    return [...shownIds, ...hidden];
  }

  const filtered = isFiltered(filter);
  const allColumns = [
    { key: 'position', label: 'N°', title: 'Position dans la file d’apprentissage' },
    ...VOCABULARY_COLUMNS,
    { key: 'status', label: 'État' },
  ];

  return (
    <section className="item-list pick" aria-labelledby="pick-title">
      <h2 id="pick-title" className="prepare__title">
        Ajouter des éléments à la session
      </h2>

      <ListFilters
        filter={filter}
        onChange={setFilter}
        searchLabel="Rechercher en anglais ou en français"
        statuses={STATUSES}
        topics={topics}
      />

      <p className="item-list__count">
        <span aria-live="polite">
          {filtered ? `${countOf(shown.length, ITEM_NOUN)} sur ${rows.length}` : countOf(rows.length, ITEM_NOUN)}
        </span>
        {filtered && shown.length > 0 && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
              Effacer les filtres
            </button>
          </>
        )}
      </p>

      <div className="selection-bar pick__bar" role="region" aria-label="Sélection">
        <strong aria-live="polite">
          {picked.size} {agree('sélectionné', ITEM_NOUN, picked.size)} · {left} place{left > 1 ? 's' : ''} restante
          {left > 1 ? 's' : ''}
        </strong>
        <span className="pick__buttons">
          <Link href={withList(prepareHref, list)} className="prepare__cancel">
            Annuler
          </Link>
          <button
            type="button"
            className="space__review space__review--learn pick__add"
            disabled={picked.size === 0}
            onClick={() => router.push(withList(prepareHref, [...list, ...chosenInOrder()]))}
          >
            Ajouter à la session ({picked.size})
          </button>
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="item-list__none">
          Aucun élément ne correspond à ces filtres.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
            Effacer les filtres
          </button>
        </p>
      ) : (
        <div className="item-list__scroll">
          <table className="item-list__table item-list__table--Vocabulary pick__table">
            <thead>
              <tr>
                <th scope="col" className="item-list__select">
                  <span className="visually-hidden">Sélection</span>
                </th>
                {allColumns.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    order={order}
                    onSort={(key) => {
                      setSortState(nextSort(order, key));
                      setPage(1);
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const checked = picked.has(row.id);
                return (
                  <tr key={row.id} className={checked ? 'is-selected' : undefined}>
                    <td className="item-list__select">
                      <label className="select-box">
                        <input
                          type="checkbox"
                          checked={checked}
                          // The room is full: only the boxes checked can still change.
                          disabled={!checked && left <= 0}
                          onChange={() => toggle(row.id)}
                        />
                        <span className="visually-hidden">Sélectionner {english(row)}</span>
                      </label>
                    </td>
                    <td className="item-list__position">{row.position}</td>
                    {VOCABULARY_COLUMNS.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.cell(row)}
                      </td>
                    ))}
                    <td>
                      <span className={`status status--${row.status}`}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && (
        <Pagination
          noun={ITEM_NOUN}
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
