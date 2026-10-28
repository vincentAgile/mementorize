'use client';

import { type ReactNode, useMemo, useState } from 'react';
import {
  effectiveSort,
  type Filter,
  filterRows,
  isFiltered,
  isQueueView,
  type ListRow,
  moveInQueue,
  NO_FILTER,
  nextSort,
  reviewLabel,
  type Sort,
  type SortSpec,
  sortRows,
  statusLabel,
} from '../../lib/item-list';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import { agree, countOf, type Noun } from '../../lib/nouns';
import type { LearningStatus, ListType } from '../../lib/types';
import { moveInQueueAction, savePageSizeAction } from './actions';
import { ListFilters, SortHeader } from './list-filters';
import { Pagination } from './pagination';
import { QueueMenu } from './queue-menu';
import { SelectionBar } from './selection-bar';
import { SelectAllNotice, useSelection } from './use-selection';

/** A column of the space, between « N° » and « État »: its header, its cell, and the class of its cells. */
export interface Column<Row> {
  key: string;
  label: string;
  className?: string;
  cell: (row: Row) => ReactNode;
}

const STATUSES = Object.keys(LEARNING_STATUS_LABELS) as LearningStatus[];

interface ItemTableProps<Row extends ListRow> {
  type: ListType;
  noun: Noun;
  /** The name of the list, for screen readers: « Mon vocabulaire ». */
  label: string;
  /** What the search looks in: « Rechercher en anglais ou en français ». */
  searchLabel: string;
  rows: Row[];
  /** The server's clock, so that the server and the browser render the same delays. */
  now: string;
  /** Items per page (MEM-58), from the account's preferences. */
  pageSize: number;
  /** Opened filtered on a state (?etat=Waiting, MEM-61). */
  initialStatus?: LearningStatus;
  columns: Column<Row>[];
  sorts: Record<string, SortSpec<Row>>;
  /** Whether a row matches the search (normalized) and the other filters of the space. */
  matches: (row: Row, needle: string, filter: Filter) => boolean;
  /** The topics in use, for the topic filter (MEM-56); none, no topic filter. */
  topics?: string[];
  /** How a row is named to screen readers and in the announcements. */
  name: (row: Row) => string;
  /** The learning queue can be changed from the list (MEM-63, MEM-64). */
  queue: boolean;
  /** The title of the confirmation of a bulk deletion (MEM-59). */
  deleteTitle: (count: number) => string;
  /** The actions of a row, with the menu to move it in the queue when it is in it. */
  actions: (row: Row, queueMenu: ReactNode) => ReactNode;
}

/**
 * The list of a space as a table: the vocabulary (MEM-16) and the quotes
 * (MEM-69). Sorted by a click on a column (MEM-17), filtered by a search
 * and a state (MEM-18) and, for the vocabulary, a topic (MEM-56), then
 * shown by pages (MEM-58); items selected Gmail-style (MEM-59), the
 * learning queue changed and reordered from it (MEM-63, MEM-64, MEM-70).
 * Everything happens in the browser: the list is already loaded; only the
 * rows of the page are rendered. The state survives the refresh after an
 * edit or a deletion (same component): same page, same search, filters and
 * sort.
 */
export function ItemTable<Row extends ListRow>({
  type,
  noun,
  label,
  searchLabel,
  rows: savedRows,
  now,
  pageSize: initialPageSize,
  initialStatus,
  columns,
  sorts,
  matches,
  topics,
  name,
  queue: withQueue,
  deleteTitle,
  actions,
}: ItemTableProps<Row>) {
  const [sort, setSortState] = useState<Sort | null>(null);
  const [filter, setFilterState] = useState<Filter>({ ...NO_FILTER, status: initialStatus ?? 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  // The result of the last action on the selection (MEM-59, MEM-63).
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  // A new search, filter, sort or page size: back to the first page. A new
  // search or filter also clears the selection: never delete items no
  // longer in view.
  const setFilter = (next: Filter) => {
    setFilterState(next);
    setPage(1);
    clearSelection();
    setNotice(undefined);
  };
  const setSort = (next: Sort) => {
    setSortState(next);
    setPage(1);
  };
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
    void savePageSizeAction(size);
  };

  // MEM-64: the order of the queue shown at once after a move, until the
  // server's answer refreshes the list (or puts the previous one back).
  // Kept with the rows it applies to: new rows from the server replace it.
  const [movedFor, setMovedFor] = useState<{ rows: Row[]; positions: Map<string, number> } | null>(null);
  const moved = movedFor?.rows === savedRows ? movedFor.positions : null;
  const setMoved = (positions: Map<string, number> | null) => setMovedFor(positions && { rows: savedRows, positions });
  const [announce, setAnnounce] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      moved ? savedRows.map((row) => (moved.has(row.id) ? { ...row, position: moved.get(row.id)! } : row)) : savedRows,
    [savedRows, moved],
  );
  const order = effectiveSort(sort, filter);
  const shown = useMemo(
    () => sortRows(filterRows(rows, filter, matches), order, sorts),
    [rows, filter, matches, order, sorts],
  );
  const queueView = withQueue && isQueueView(filter, sort);
  const queue = useMemo(
    () =>
      rows
        .filter((row) => row.position !== null)
        .sort((a, b) => a.position! - b.position!)
        .map((row) => row.id),
    [rows],
  );
  // After a deletion, the last page may be empty: the one before it.
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);

  // MEM-59: the items checked, or all those of the search and filters ("Gmail" selection),
  // in the order of the list: the queue gets them in this order (MEM-63).
  const selection = useSelection(
    shown.map((row) => row.id),
    pageRows.map((row) => row.id),
  );
  const { ids: selectedIds, isSelected, pageAll, headerBox, toggleRow, togglePage } = selection;
  const clearSelection = selection.clear;
  /** MEM-64: moves an item of the queue, shown at once, saved on the server. */
  async function move(row: Row, position: number) {
    const next = moveInQueue(queue, row.id, position);
    const target = next.indexOf(row.id) + 1;
    setMoved(new Map(next.map((other, index) => [other, index + 1])));
    setAnnounce(`${name(row)} ${agree('déplacé', noun, 1)} en position ${target} sur ${next.length}`);
    // « Monter » / « Descendre » across the limits of a page: the page follows the item.
    if (queueView) setPage(Math.ceil(target / pageSize));
    if ((await moveInQueueAction(type, row.id, target)) === null) {
      setMoved(null);
      setAnnounce('');
      setNotice({ ok: false, text: 'Le déplacement a échoué : la file a retrouvé son ordre précédent. Réessaie.' });
    }
  }

  const date = new Date(now);
  const filtered = isFiltered(filter);
  const allColumns: { key: string; label: string; title?: string }[] = [
    { key: 'position', label: 'N°', title: 'Position dans la file d’apprentissage' }, // MEM-64
    ...columns,
    { key: 'status', label: 'État' },
    { key: 'review', label: 'Révision' },
  ];
  const none = `${noun.feminine ? 'Aucune' : 'Aucun'} ${noun.one}`;

  return (
    <section className="item-list" aria-label={label}>
      <ListFilters filter={filter} onChange={setFilter} searchLabel={searchLabel} statuses={STATUSES} topics={topics} />

      <p className="item-list__count">
        <span aria-live="polite">
          {filtered ? `${countOf(shown.length, noun)} sur ${rows.length}` : countOf(rows.length, noun)}
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

      {/* MEM-64: where a moved item is now, for screen readers. */}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
      {withQueue && filter.status === 'ToLearn' && !queueView && shown.length > 0 && (
        <p className="queue-hint">
          Pour réordonner la file, affichez-la en entier, triée par N°, sans recherche
          {topics ? ' ni filtre de thématique' : ''}.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFilter({ ...NO_FILTER, status: 'ToLearn' });
              setSortState(null);
            }}
          >
            Afficher la file
          </button>
        </p>
      )}

      {notice && (
        <p className={notice.ok ? 'notice' : 'form-error'} role="status">
          {notice.text}
        </p>
      )}

      {selectedIds.length > 0 && (
        <SelectionBar
          type={type}
          noun={noun}
          ids={selectedIds}
          queue={withQueue}
          deleteTitle={deleteTitle}
          onClear={clearSelection}
          onDeleted={(count) => {
            setNotice(
              count === null
                ? { ok: false, text: 'La suppression a échoué : rien n’a été supprimé. Réessaie.' }
                : { ok: true, text: `${countOf(count, noun)} ${agree('supprimé', noun, count)}.` },
            );
            if (count !== null) clearSelection();
          }}
          onQueued={(op, result) => {
            setNotice(
              result === null
                ? { ok: false, text: 'L’opération a échoué : rien n’a changé. Réessaie.' }
                : { ok: true, text: queueNotice(op, result, noun) },
            );
            if (result !== null) clearSelection();
          }}
        />
      )}

      <SelectAllNotice
        selection={selection}
        noun={noun}
        shownCount={shown.length}
        pageCount={pageRows.length}
        filtered={filtered}
      />

      {shown.length === 0 ? (
        <p className="item-list__none">
          {none} ne correspond à ces filtres.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
            Effacer les filtres
          </button>
        </p>
      ) : (
        <div className="item-list__scroll">
          <table className={`item-list__table item-list__table--${type}`}>
            <thead>
              <tr>
                <th scope="col" className="item-list__select">
                  <label className="select-box">
                    <input ref={headerBox} type="checkbox" checked={pageAll} onChange={togglePage} />
                    <span className="visually-hidden">Sélectionner les {noun.many} de la page</span>
                  </label>
                </th>
                {allColumns.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    order={order}
                    onSort={(key) => setSort(nextSort(order, key))}
                  />
                ))}
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    [
                      isSelected(row.id) && 'is-selected',
                      dragged === row.id && 'is-dragged',
                      dropOn === row.id && 'is-drop-target',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  // MEM-64: drag and drop, within the page, when the whole queue is shown in order.
                  onDragOver={(event) => {
                    if (!queueView || !dragged || row.position === null) return;
                    event.preventDefault();
                    setDropOn(row.id);
                  }}
                  onDragLeave={() => setDropOn((current) => (current === row.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = rows.find((other) => other.id === dragged);
                    setDragged(null);
                    setDropOn(null);
                    if (from && row.position !== null && from.id !== row.id) void move(from, row.position);
                  }}
                >
                  <td className="item-list__select">
                    <label className="select-box">
                      <input type="checkbox" checked={isSelected(row.id)} onChange={() => toggleRow(row.id)} />
                      <span className="visually-hidden">Sélectionner {name(row)}</span>
                    </label>
                  </td>
                  <td className="item-list__position">
                    {queueView && row.position !== null && (
                      <span
                        className="drag-handle"
                        draggable
                        title="Glisser pour déplacer dans la file"
                        aria-hidden="true"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', row.id);
                          setDragged(row.id);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropOn(null);
                        }}
                      >
                        ⠿
                      </span>
                    )}
                    {row.position}
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.cell(row)}
                    </td>
                  ))}
                  <td>
                    <span className={`status status--${row.status}`}>{statusLabel(row.status)}</span>
                  </td>
                  <td className="item-list__review">{reviewLabel(row, date)}</td>
                  <td>
                    {actions(
                      row,
                      withQueue && row.position !== null && (
                        <QueueMenu
                          name={name(row)}
                          position={row.position}
                          total={queue.length}
                          stepwise={queueView}
                          onMove={(position) => void move(row, position)}
                        />
                      ),
                    )}
                  </td>
                </tr>
              ))}
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

/** « 40 éléments ajoutés à la file, 3 ignorés » (MEM-63, MEM-64), « 2 citations placées en tête de file ». */
function queueNotice(
  op: 'add' | 'remove' | 'top',
  { changed, ignored }: { changed: number; ignored: number },
  noun: Noun,
): string {
  const items = countOf(changed, noun);
  const done =
    op === 'add'
      ? `${items} ${agree('ajouté', noun, changed)} à la file d’apprentissage`
      : op === 'top'
        ? `${items} ${agree('placé', noun, changed)} en tête de file`
        : `${items} ${agree('retiré', noun, changed)} de la file, en attente`;
  const why = op === 'add' ? 'pas en attente' : 'pas dans la file';
  return ignored > 0 ? `${done}, ${ignored} ${agree('ignoré', noun, ignored)} (${why}).` : `${done}.`;
}
