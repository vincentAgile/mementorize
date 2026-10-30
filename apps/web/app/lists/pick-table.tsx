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
import type { ListRow } from '../../lib/item-list';
import { agree, countOf, type Noun } from '../../lib/nouns';
import { withList } from '../../lib/session-preparation';
import type { LearningStatus, ListType } from '../../lib/types';
import { savePageSizeAction } from './actions';
import type { Column } from './item-table';
import { ListFilters, SortHeader } from './list-filters';
import { Pagination } from './pagination';

/** The states of the items that can be added to a session. */
const STATUSES: LearningStatus[] = ['ToLearn', 'Waiting'];

/** By default, the order of the queue, then the items « En attente », the oldest first. */
const QUEUE_ORDER: Sort = { key: 'position', direction: 'asc' };
const BY_POSITION: SortSpec<ListRow> = {
  compare: (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.createdAt - b.createdAt,
};

/** What differs from one space to the other: the columns, the search, the sorts, the wording. */
export interface PickKind<R extends ListRow> {
  type: ListType;
  noun: Noun;
  columns: Column<R>[];
  sorts: Record<string, SortSpec<R>>;
  matches: (row: R, needle: string, filter: Filter) => boolean;
  searchLabel: string;
  /** How a row is named to screen readers: « Sélectionner snag ». */
  name: (row: R) => string;
  /** The topic filter (MEM-56), for the vocabulary only. */
  topicsOf?: (rows: R[]) => string[];
}

interface PickTableProps<R extends ListRow> {
  kind: PickKind<R>;
  /** The items that can be added: « À apprendre » and « En attente », not already in the session. */
  rows: R[];
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
 * shown here. The vocabulary (MEM-95) and the quotes, each with its kind.
 */
export function PickTable<R extends ListRow>({
  kind,
  rows,
  list,
  room,
  prepareHref,
  pageSize: initialPageSize,
}: PickTableProps<R>) {
  const { noun } = kind;
  const SORTS = useMemo(() => ({ ...kind.sorts, position: BY_POSITION as SortSpec<R> }), [kind.sorts]);
  const router = useRouter();
  const [sort, setSortState] = useState<Sort | null>(null);
  const [filter, setFilterState] = useState<Filter>(NO_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const topics = useMemo(() => kind.topicsOf?.(rows), [kind, rows]);

  const order = sort ?? QUEUE_ORDER;
  const shown = useMemo(
    () => sortRows(filterRows(rows, filter, kind.matches), order, SORTS),
    [rows, filter, order, kind.matches, SORTS],
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
    ...kind.columns,
    { key: 'status', label: 'État' },
  ];

  return (
    <section className="item-list pick" aria-labelledby="pick-title">
      <h2 id="pick-title" className="prepare__title">
        Ajouter des {noun.many} à la session
      </h2>

      <ListFilters
        filter={filter}
        onChange={setFilter}
        searchLabel={kind.searchLabel}
        statuses={STATUSES}
        topics={topics}
      />

      <p className="item-list__count">
        <span aria-live="polite">
          {filtered ? `${countOf(shown.length, noun)} sur ${rows.length}` : countOf(rows.length, noun)}
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
          {picked.size} {agree('sélectionné', noun, picked.size)} · {left} place{left > 1 ? 's' : ''} restante
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
          Aucun{noun.feminine ? 'e' : ''} {noun.one} ne correspond à ces filtres.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
            Effacer les filtres
          </button>
        </p>
      ) : (
        <div className="item-list__scroll">
          <table className={`item-list__table item-list__table--${kind.type} pick__table`}>
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
                        <span className="visually-hidden">Sélectionner {kind.name(row)}</span>
                      </label>
                    </td>
                    <td className="item-list__position">{row.position}</td>
                    {kind.columns.map((column) => (
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
          noun={noun}
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
