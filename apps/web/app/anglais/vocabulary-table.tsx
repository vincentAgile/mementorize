'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NBSP } from '../../lib/format';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import type { LearningStatus, Translator } from '../../lib/types';
import {
  ALL_TOPICS,
  type Filter,
  filterRows,
  isFiltered,
  NO_TOPIC,
  NO_FILTER,
  nextSort,
  reviewLabel,
  type Sort,
  type SortKey,
  sortRows,
  statusLabel,
  toRow,
  topicsOf,
  type VocabularyItem,
} from '../../lib/vocabulary-table';
import { savePageSizeAction } from './actions';
import { Pagination } from './pagination';
import { SelectionBar } from './selection-bar';
import { VocabularyActions } from './vocabulary-actions';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'english', label: 'Anglais' },
  { key: 'french', label: 'Français' },
  { key: 'topic', label: 'Thématique' },
  { key: 'status', label: 'État' },
  { key: 'review', label: 'Révision' },
];

const STATUSES = Object.keys(LEARNING_STATUS_LABELS) as LearningStatus[];

interface VocabularyTableProps {
  items: VocabularyItem[];
  /** The server's clock, so that the server and the browser render the same delays. */
  now: string;
  /** The service of the translate buttons of the edit form (MEM-44). */
  translator: Translator;
  /** Items per page (MEM-58), from the account's preferences. */
  pageSize: number;
  /** Opened filtered on a state (?etat=Waiting, MEM-61). */
  initialStatus?: LearningStatus;
}

/**
 * The vocabulary of the Anglais space as a table (MEM-16), sorted by a
 * click on a column (MEM-17) and filtered by a search, a state (MEM-18)
 * and a topic (MEM-56), then shown by pages (MEM-58). Everything happens
 * in the browser: the list is already loaded; only the rows of the page
 * are rendered. The state survives the refresh after an edit or a
 * deletion (same component): same page, same search, filters and sort.
 */
export function VocabularyTable({
  items,
  now,
  translator,
  pageSize: initialPageSize,
  initialStatus,
}: VocabularyTableProps) {
  const [sort, setSortState] = useState<Sort | null>(null);
  const [filter, setFilterState] = useState<Filter>({ ...NO_FILTER, status: initialStatus ?? 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  // MEM-59: the items checked, or all those of the search and filters ("Gmail" selection).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  // The result of the last action on the selection (MEM-59, MEM-63).
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const clearSelection = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
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
  const searchId = useId();

  const rows = useMemo(() => items.map(toRow), [items]);
  const topics = useMemo(() => topicsOf(rows.map((row) => row.topic)), [rows]); // MEM-51
  const shown = useMemo(() => sortRows(filterRows(rows, filter), sort), [rows, filter, sort]);
  // After a deletion, the last page may be empty: the one before it.
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);

  // In the order of the list: the queue gets them in this order (MEM-63).
  const selectedIds = allMatching
    ? shown.map((row) => row.id)
    : shown.filter((row) => selected.has(row.id)).map((row) => row.id);
  const isSelected = (id: string) => allMatching || selected.has(id);
  const pageIds = pageRows.map((row) => row.id);
  const pageAll = pageIds.length > 0 && pageIds.every(isSelected);
  const pageSome = pageIds.some(isSelected);
  const more = shown.length > pageIds.length; // other items than those of the page
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = pageSome && !pageAll;
  }, [pageSome, pageAll]);

  /** From "all those of the filters" back to a list of ids, to uncheck some of them. */
  const explicit = () => (allMatching ? new Set(shown.map((row) => row.id)) : new Set(selected));
  function toggleRow(id: string) {
    const next = explicit();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setAllMatching(false);
  }
  function togglePage() {
    const next = explicit();
    for (const id of pageIds) {
      if (pageAll) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
    setAllMatching(false);
  }
  const date = new Date(now);
  const filtered = isFiltered(filter);
  // The chosen topic stays in the list even when no item has it any more (deleted, edited).
  const topicChoices =
    filter.topic === ALL_TOPICS || filter.topic === NO_TOPIC || topics.includes(filter.topic)
      ? topics
      : [...topics, filter.topic];

  return (
    <section className="vocabulary" aria-label="Mon vocabulaire">
      <div className="vocabulary__filters">
        <label htmlFor={searchId} className="visually-hidden">
          Rechercher en anglais ou en français
        </label>
        <input
          id={searchId}
          type="search"
          placeholder="Rechercher en anglais ou en français"
          value={filter.search}
          onChange={(event) => setFilter({ ...filter, search: event.target.value })}
        />
        <select
          aria-label="Filtrer par état"
          value={filter.status}
          onChange={(event) => setFilter({ ...filter, status: event.target.value as Filter['status'] })}
        >
          <option value="all">Tous les états</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
        {/* MEM-56 */}
        <select
          aria-label="Filtrer par thématique"
          value={filter.topic}
          onChange={(event) => setFilter({ ...filter, topic: event.target.value })}
        >
          <option value={ALL_TOPICS}>Toutes les thématiques</option>
          {topicChoices.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
          <option value={NO_TOPIC}>Sans thématique</option>
        </select>
      </div>

      <p className="vocabulary__count">
        <span aria-live="polite">
          {filtered
            ? `${shown.length}\u00a0élément${shown.length > 1 ? 's' : ''} sur\u00a0${rows.length}`
            : `${rows.length}\u00a0élément${rows.length > 1 ? 's' : ''}`}
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

      {notice && (
        <p className={notice.ok ? 'notice' : 'form-error'} role="status">
          {notice.text}
        </p>
      )}

      {selectedIds.length > 0 && (
        <SelectionBar
          ids={selectedIds}
          onClear={clearSelection}
          onDeleted={(count) => {
            setNotice(
              count === null
                ? { ok: false, text: 'La suppression a échoué : rien n’a été supprimé. Réessaie.' }
                : { ok: true, text: `${count}${NBSP}élément${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''}.` },
            );
            if (count !== null) clearSelection();
          }}
          onQueued={(op, result) => {
            setNotice(
              result === null
                ? { ok: false, text: 'L’opération a échoué : rien n’a changé. Réessaie.' }
                : { ok: true, text: queueNotice(op, result) },
            );
            if (result !== null) clearSelection();
          }}
        />
      )}

      {pageAll && more && (
        <p className="selection-all">
          {allMatching ? (
            <>
              Les {shown.length}
              {NBSP}éléments sont sélectionnés.{' '}
              <button type="button" className="link-button" onClick={clearSelection}>
                Annuler la sélection
              </button>
            </>
          ) : (
            <>
              Les {pageIds.length}
              {NBSP}éléments de cette page sont sélectionnés.{' '}
              <button type="button" className="link-button" onClick={() => setAllMatching(true)}>
                Sélectionner les {shown.length}
                {NBSP}éléments {filtered ? 'correspondant à la recherche et aux filtres' : 'de la liste'}
              </button>
            </>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="vocabulary__none">
          Aucun élément ne correspond à ces filtres.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(NO_FILTER)}>
            Effacer les filtres
          </button>
        </p>
      ) : (
        <div className="vocabulary__scroll">
          <table className="vocabulary__table">
            <thead>
              <tr>
                <th scope="col" className="vocabulary__select">
                  <label className="select-box">
                    <input ref={headerBox} type="checkbox" checked={pageAll} onChange={togglePage} />
                    <span className="visually-hidden">Sélectionner les éléments de la page</span>
                  </label>
                </th>
                {COLUMNS.map((column) => {
                  const active = sort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <button type="button" onClick={() => setSort(nextSort(sort, column.key))}>
                        {column.label}
                        <span className="vocabulary__arrow" aria-hidden="true">
                          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className={isSelected(row.id) ? 'is-selected' : undefined}>
                  <td className="vocabulary__select">
                    <label className="select-box">
                      <input type="checkbox" checked={isSelected(row.id)} onChange={() => toggleRow(row.id)} />
                      <span className="visually-hidden">Sélectionner {row.english}</span>
                    </label>
                  </td>
                  <td>
                    <span lang="en" className="vocabulary__english">
                      {row.english}
                    </span>
                    {row.example && (
                      <span lang="en" className="vocabulary__example">
                        {row.example}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.french}
                    {row.frenchExample && (
                      <span lang="fr" className="vocabulary__example">
                        {row.frenchExample}
                      </span>
                    )}
                  </td>
                  <td className="vocabulary__topic">{row.topic}</td>
                  <td>
                    <span className={`status status--${row.status}`}>{statusLabel(row.status)}</span>
                  </td>
                  <td className="vocabulary__review">{reviewLabel(row, date)}</td>
                  <td>
                    <VocabularyActions row={row} translator={translator} topics={topics} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && (
        <Pagination
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

/** « 40 éléments ajoutés à la file, 3 ignorés » (MEM-63). */
function queueNotice(op: 'add' | 'remove', { changed, ignored }: { changed: number; ignored: number }): string {
  const items = (count: number) => `${count}${NBSP}élément${count > 1 ? 's' : ''}`;
  const done =
    op === 'add'
      ? `${items(changed)} ajouté${changed > 1 ? 's' : ''} à la file d’apprentissage`
      : `${items(changed)} retiré${changed > 1 ? 's' : ''} de la file, en attente`;
  const why = op === 'add' ? 'pas en attente' : 'pas dans la file';
  return ignored > 0 ? `${done}, ${ignored}${NBSP}ignoré${ignored > 1 ? 's' : ''} (${why}).` : `${done}.`;
}
