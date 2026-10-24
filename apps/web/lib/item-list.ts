import { formatDelay } from './format';
import { LEARNING_STATUS_LABELS } from './learning-status';
import type { LearningStatus } from './types';

/**
 * The list of a space as a table: the vocabulary (MEM-16) and the quotes
 * (MEM-69). How its rows are sorted (MEM-17), filtered (MEM-18), shown by
 * pages (MEM-58), and how its learning queue is reordered (MEM-64). Plain
 * functions, without React: the table component only wires them to its
 * state. What differs from one space to the other (the columns, what the
 * search looks in) is given by lib/vocabulary-table.ts and
 * lib/quote-table.ts.
 */

/** What every row has, whatever the space. */
export interface ListRow {
  id: string;
  status: LearningStatus;
  /** MEM-61: position in the learning queue, for an item "À apprendre"; null otherwise. */
  position: number | null;
  createdAt: number;
  /** Due date of the card reviewed, for an item being learned; null otherwise. */
  nextDue: number | null;
}

/** The "Révision" column: "à réviser", "dans 3 j", or a dash when the item isn't reviewed. */
export function reviewLabel(row: ListRow, now: Date): string {
  if (row.nextDue === null) return '—';
  return row.nextDue <= now.getTime() ? 'à réviser' : `dans ${formatDelay(now, new Date(row.nextDue))}`;
}

export const statusLabel = (status: LearningStatus) => LEARNING_STATUS_LABELS[status];

// --- Sorting (MEM-17) ---

export interface Sort {
  key: string;
  direction: 'asc' | 'desc';
}

/** How a column sorts its rows; the rows `missing` the value stay last in both directions. */
export interface SortSpec<Row> {
  compare: (a: Row, b: Row) => number;
  missing?: (row: Row) => boolean;
}

// Alphabetical order ignoring case and accents ("élan" next to "elan").
export const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const STATUS_ORDER: Record<LearningStatus, number> = { Waiting: 0, ToLearn: 1, Learning: 2, Learned: 3 };

/** The columns every list has: the place in the queue, the state, the next review. */
export const COMMON_SORTS: Record<'position' | 'status' | 'review', SortSpec<ListRow>> = {
  position: { compare: (a, b) => a.position! - b.position!, missing: (row) => row.position === null }, // MEM-64
  status: { compare: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] },
  review: { compare: (a, b) => a.nextDue! - b.nextDue!, missing: (row) => row.nextDue === null },
};

/**
 * Sorted copy of the rows. Without a sort, the most recently added first.
 * Rows without the value (no review, no topic…) stay last in both
 * directions; ties keep the default order.
 */
export function sortRows<Row extends ListRow>(
  rows: Row[],
  sort: Sort | null,
  specs: Record<string, SortSpec<Row>>,
): Row[] {
  const byDate = (a: Row, b: Row) => b.createdAt - a.createdAt;
  const spec = sort && specs[sort.key];
  if (!sort || !spec) return [...rows].sort(byDate);

  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (spec.missing && spec.missing(a) !== spec.missing(b)) return spec.missing(a) ? 1 : -1;
    if (spec.missing?.(a)) return byDate(a, b);
    return sign * spec.compare(a, b) || byDate(a, b);
  });
}

/** Clicking a header: ascending first, then the other way. */
export function nextSort(current: Sort | null, key: string): Sort {
  return current?.key === key && current.direction === 'asc' ? { key, direction: 'desc' } : { key, direction: 'asc' };
}

// --- Filtering (MEM-18) ---

/** Lower case, without accents: "Élan" and "elan" match. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr');
}

export interface Filter {
  search: string;
  status: LearningStatus | 'all';
  /** MEM-56, the vocabulary only: a topic (as shown in the list of topics), or none, or all. */
  topic: string | typeof ALL_TOPICS | typeof NO_TOPIC;
}

// Values of the topic filter that can't be a topic (a topic is trimmed).
export const ALL_TOPICS = ' all';
export const NO_TOPIC = ' none';

export const NO_FILTER: Filter = { search: '', status: 'all', topic: ALL_TOPICS };

/**
 * The rows in the chosen state that `matches` keeps: the search (already
 * normalized, empty when there is none) and, for the vocabulary, the topic.
 */
export function filterRows<Row extends ListRow>(
  rows: Row[],
  filter: Filter,
  matches: (row: Row, needle: string, filter: Filter) => boolean,
): Row[] {
  const needle = normalize(filter.search.trim());
  return rows.filter(
    (row) => (filter.status === 'all' || row.status === filter.status) && matches(row, needle, filter),
  );
}

/** Some filter is on: the count says "12 éléments sur 85", and "Effacer les filtres" is offered. */
export const isFiltered = (filter: Filter) =>
  filter.search !== '' || filter.status !== 'all' || filter.topic !== ALL_TOPICS;

/** The values in use, once each (ignoring case), in alphabetical order: suggestions of a field (topics, authors). */
export function distinctValues(values: (string | null | undefined)[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    if (value && !unique.has(value.toLocaleLowerCase('fr'))) unique.set(value.toLocaleLowerCase('fr'), value);
  }
  return [...unique.values()].sort(collator.compare);
}

// --- Pages (MEM-58) ---

export const PAGE_SIZES = [20, 50, 100] as const;

/**
 * The page numbers to offer, with an ellipsis (null) for the gaps: always
 * the first and the last page, and the pages around the current one.
 * 1 … 4 5 6 … 12
 */
export function pageNumbers(current: number, count: number): (number | null)[] {
  const pages = new Set([1, count, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const page of sorted) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && page - previous === 2) result.push(previous + 1);
    else if (typeof previous === 'number' && page - previous > 2) result.push(null);
    result.push(page);
  }
  return result;
}

// --- The learning queue (MEM-64) ---

/** Filtered on "À apprendre" without a chosen sort: the list follows the queue. */
export function effectiveSort(sort: Sort | null, filter: Filter): Sort | null {
  return sort ?? (filter.status === 'ToLearn' ? { key: 'position', direction: 'asc' } : null);
}

/**
 * The list shows the whole learning queue, in its order: it can be
 * reordered (drag and drop, « Monter », « Descendre »).
 */
export function isQueueView(filter: Filter, sort: Sort | null): boolean {
  const order = effectiveSort(sort, filter);
  return (
    filter.status === 'ToLearn' &&
    filter.search.trim() === '' &&
    filter.topic === ALL_TOPICS &&
    order?.key === 'position' &&
    order.direction === 'asc'
  );
}

/** The ids of the queue in their new order once `id` is at `position` (1: the head). */
export function moveInQueue(queue: string[], id: string, position: number): string[] {
  const rest = queue.filter((other) => other !== id);
  const index = Math.min(Math.max(position, 1), rest.length + 1) - 1;
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}
