'use client';

import { useId } from 'react';
import { ALL_TOPICS, type Filter, NO_TOPIC, type Sort, statusLabel } from '../../lib/item-list';
import type { LearningStatus } from '../../lib/types';

interface ListFiltersProps {
  filter: Filter;
  onChange: (filter: Filter) => void;
  /** What the search looks in: « Rechercher en anglais ou en français ». */
  searchLabel: string;
  /** The states offered by the state filter; none, no state filter. */
  statuses: LearningStatus[];
  /** The topics in use (MEM-56); none, no topic filter. */
  topics?: string[];
}

/**
 * The search and the filters above the list of a space (MEM-18, MEM-56);
 * also above the selection of the items to add to a learning session (MEM-95).
 */
export function ListFilters({ filter, onChange, searchLabel, statuses, topics }: ListFiltersProps) {
  const searchId = useId();
  // The chosen topic stays in the list even when no item has it any more (deleted, edited).
  const topicChoices =
    topics && (filter.topic === ALL_TOPICS || filter.topic === NO_TOPIC || topics.includes(filter.topic))
      ? topics
      : [...(topics ?? []), filter.topic];
  return (
    <div className="item-list__filters">
      <label htmlFor={searchId} className="visually-hidden">
        {searchLabel}
      </label>
      <input
        id={searchId}
        type="search"
        placeholder={searchLabel}
        value={filter.search}
        onChange={(event) => onChange({ ...filter, search: event.target.value })}
      />
      {statuses.length > 0 && (
        // None: no state filter (the mind maps, MEM-98).
        <select
          aria-label="Filtrer par état"
          value={filter.status}
          onChange={(event) => onChange({ ...filter, status: event.target.value as Filter['status'] })}
        >
          <option value="all">Tous les états</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      )}
      {topics && (
        // MEM-56
        <select
          aria-label="Filtrer par thématique"
          value={filter.topic}
          onChange={(event) => onChange({ ...filter, topic: event.target.value })}
        >
          <option value={ALL_TOPICS}>Toutes les thématiques</option>
          {topicChoices.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
          <option value={NO_TOPIC}>Sans thématique</option>
        </select>
      )}
    </div>
  );
}

/** The header of a sortable column (MEM-17): a click sorts by it, ascending first. */
export function SortHeader({
  column,
  order,
  onSort,
}: {
  column: { key: string; label: string; title?: string };
  order: Sort | null;
  onSort: (key: string) => void;
}) {
  const active = order?.key === column.key;
  return (
    <th scope="col" aria-sort={active ? (order.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" title={column.title} onClick={() => onSort(column.key)}>
        {column.label}
        <span className="item-list__arrow" aria-hidden="true">
          {active ? (order.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
