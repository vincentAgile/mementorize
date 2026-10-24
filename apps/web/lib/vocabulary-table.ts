import { formatDelay } from './format';
import { LEARNING_STATUS_LABELS } from './learning-status';
import type { Item, LearningStatus, VocabularyContent } from './types';

/**
 * The rows of the vocabulary table (MEM-16) and how they are sorted
 * (MEM-17) and filtered (MEM-18). Plain functions, without React: the
 * table component only wires them to its state.
 */

export type VocabularyItem = Item & { type: 'Vocabulary'; content: VocabularyContent };

export interface VocabularyRow {
  id: string;
  english: string;
  french: string;
  example: string | null;
  /** MEM-42 */
  frenchExample: string | null;
  /** MEM-51 */
  topic: string | null;
  status: LearningStatus;
  /** MEM-61: position in the learning queue, for an item "À apprendre"; null otherwise. */
  position: number | null;
  createdAt: number;
  /** Due date of the French → English card (MEM-40: the only one reviewed), for an item being learned; null otherwise. */
  nextDue: number | null;
}

export function toRow(item: VocabularyItem): VocabularyRow {
  const dues = (item.cards ?? [])
    .filter((card) => card.kind !== 'EnglishToFrench') // MEM-40: not reviewed
    .map((card) => new Date(card.due).getTime());
  return {
    id: item.id,
    english: item.content.word,
    french: item.content.translation,
    example: item.content.example,
    frenchExample: item.content.frenchExample ?? null,
    topic: item.content.topic ?? null,
    status: item.learningStatus,
    position: item.learningStatus === 'ToLearn' ? (item.learnPosition ?? null) : null,
    createdAt: new Date(item.createdAt).getTime(),
    nextDue: item.learningStatus === 'Learning' && dues.length > 0 ? Math.min(...dues) : null,
  };
}

/** The "Révision" column: "à réviser", "dans 3 j", or a dash when the item isn't reviewed. */
export function reviewLabel(row: VocabularyRow, now: Date): string {
  if (row.nextDue === null) return '—';
  return row.nextDue <= now.getTime() ? 'à réviser' : `dans ${formatDelay(now, new Date(row.nextDue))}`;
}

export const statusLabel = (status: LearningStatus) => LEARNING_STATUS_LABELS[status];

// --- Sorting (MEM-17) ---

export type SortKey = 'position' | 'english' | 'french' | 'topic' | 'status' | 'review';
export interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

// Alphabetical order ignoring case and accents ("élan" next to "elan").
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const STATUS_ORDER: Record<LearningStatus, number> = { Waiting: 0, ToLearn: 1, Learning: 2, Learned: 3 };

const COMPARE: Record<SortKey, (a: VocabularyRow, b: VocabularyRow) => number> = {
  position: (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity), // MEM-64
  english: (a, b) => collator.compare(a.english, b.english),
  french: (a, b) => collator.compare(a.french, b.french),
  topic: (a, b) => collator.compare(a.topic ?? '', b.topic ?? ''),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  review: (a, b) => (a.nextDue ?? Infinity) - (b.nextDue ?? Infinity),
};

/**
 * Sorted copy of the rows. Without a sort, the most recently added first.
 * Rows without a review, or without a topic (MEM-51), stay last in both
 * directions; ties keep the default order.
 */
export function sortRows(rows: VocabularyRow[], sort: Sort | null): VocabularyRow[] {
  const byDate = (a: VocabularyRow, b: VocabularyRow) => b.createdAt - a.createdAt;
  if (!sort) return [...rows].sort(byDate);

  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'review' && (a.nextDue === null) !== (b.nextDue === null)) {
      return a.nextDue === null ? 1 : -1;
    }
    if (sort.key === 'topic' && (a.topic === null) !== (b.topic === null)) {
      return a.topic === null ? 1 : -1;
    }
    if (sort.key === 'position' && (a.position === null) !== (b.position === null)) {
      return a.position === null ? 1 : -1;
    }
    return sign * COMPARE[sort.key](a, b) || byDate(a, b);
  });
}

/** Clicking a header: ascending first, then the other way. */
export function nextSort(current: Sort | null, key: SortKey): Sort {
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
  /** MEM-56: a topic (as shown in the list of topics), or none, or all. */
  topic: string | typeof ALL_TOPICS | typeof NO_TOPIC;
}

// Values of the topic filter that can't be a topic (a topic is trimmed).
export const ALL_TOPICS = ' all';
export const NO_TOPIC = ' none';

export const NO_FILTER: Filter = { search: '', status: 'all', topic: ALL_TOPICS };

const sameTopic = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

/** The rows whose English or French contains the search, in the chosen state and topic. */
export function filterRows(rows: VocabularyRow[], { search, status, topic }: Filter): VocabularyRow[] {
  const needle = normalize(search.trim());
  return rows.filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      (topic === ALL_TOPICS ||
        (topic === NO_TOPIC ? row.topic === null : row.topic !== null && sameTopic(row.topic, topic))) &&
      (!needle || normalize(row.english).includes(needle) || normalize(row.french).includes(needle)),
  );
}

/** Some filter is on: the count says "12 éléments sur 85", and "Effacer les filtres" is offered. */
export const isFiltered = (filter: Filter) =>
  filter.search !== '' || filter.status !== 'all' || filter.topic !== ALL_TOPICS;

// --- Topics (MEM-51) ---

/** The topics in use, once each (ignoring case), in alphabetical order: the suggestions of the topic field. */
export function topicsOf(topics: (string | null | undefined)[]): string[] {
  const unique = new Map<string, string>();
  for (const topic of topics) {
    if (topic && !unique.has(topic.toLocaleLowerCase('fr'))) unique.set(topic.toLocaleLowerCase('fr'), topic);
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
