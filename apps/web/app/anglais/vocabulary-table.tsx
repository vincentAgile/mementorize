'use client';

import { useId, useMemo, useState } from 'react';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import type { LearningStatus } from '../../lib/types';
import {
  type Filter,
  filterRows,
  NO_FILTER,
  nextSort,
  reviewLabel,
  type Sort,
  type SortKey,
  sortRows,
  statusLabel,
  toRow,
  type VocabularyItem,
} from '../../lib/vocabulary-table';
import { VocabularyActions } from './vocabulary-actions';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'english', label: 'Anglais' },
  { key: 'french', label: 'Français' },
  { key: 'status', label: 'État' },
  { key: 'review', label: 'Révision' },
];

const STATUSES = Object.keys(LEARNING_STATUS_LABELS) as LearningStatus[];

interface VocabularyTableProps {
  items: VocabularyItem[];
  /** The server's clock, so that the server and the browser render the same delays. */
  now: string;
}

/**
 * The vocabulary of the Anglais space as a table (MEM-16), sorted by a
 * click on a column (MEM-17) and filtered by a search and a state
 * (MEM-18). Everything happens in the browser: the list is already loaded.
 */
export function VocabularyTable({ items, now }: VocabularyTableProps) {
  const [sort, setSort] = useState<Sort | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const searchId = useId();

  const rows = useMemo(() => items.map(toRow), [items]);
  const shown = useMemo(() => sortRows(filterRows(rows, filter), sort), [rows, filter, sort]);
  const date = new Date(now);
  const filtered = filter.search !== '' || filter.status !== 'all';

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
      </div>

      <p className="vocabulary__count" aria-live="polite">
        {filtered
          ? `${shown.length} élément${shown.length > 1 ? 's' : ''} sur ${rows.length}`
          : `${rows.length} élément${rows.length > 1 ? 's' : ''}`}
      </p>

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
              {shown.map((row) => (
                <tr key={row.id}>
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
                  <td>{row.french}</td>
                  <td>
                    <span className={`status status--${row.status}`}>{statusLabel(row.status)}</span>
                  </td>
                  <td className="vocabulary__review">{reviewLabel(row, date)}</td>
                  <td>
                    <VocabularyActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
