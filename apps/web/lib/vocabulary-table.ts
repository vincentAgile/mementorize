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
  status: LearningStatus;
  createdAt: number;
  /** Earliest due date of the two cards, for an item being learned; null otherwise. */
  nextDue: number | null;
}

export function toRow(item: VocabularyItem): VocabularyRow {
  const dues = (item.cards ?? []).map((card) => new Date(card.due).getTime());
  return {
    id: item.id,
    english: item.content.word,
    french: item.content.translation,
    example: item.content.example,
    status: item.learningStatus,
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

export type SortKey = 'english' | 'french' | 'status' | 'review';
export interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

// Alphabetical order ignoring case and accents ("élan" next to "elan").
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const STATUS_ORDER: Record<LearningStatus, number> = { ToLearn: 0, Learning: 1, Learned: 2 };

const COMPARE: Record<SortKey, (a: VocabularyRow, b: VocabularyRow) => number> = {
  english: (a, b) => collator.compare(a.english, b.english),
  french: (a, b) => collator.compare(a.french, b.french),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  review: (a, b) => (a.nextDue ?? Infinity) - (b.nextDue ?? Infinity),
};

/**
 * Sorted copy of the rows. Without a sort, the most recently added first.
 * Rows without a review stay last in both directions; ties keep the
 * default order.
 */
export function sortRows(rows: VocabularyRow[], sort: Sort | null): VocabularyRow[] {
  const byDate = (a: VocabularyRow, b: VocabularyRow) => b.createdAt - a.createdAt;
  if (!sort) return [...rows].sort(byDate);

  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'review' && (a.nextDue === null) !== (b.nextDue === null)) {
      return a.nextDue === null ? 1 : -1;
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
}

export const NO_FILTER: Filter = { search: '', status: 'all' };

/** The rows whose English or French contains the search, in the chosen state. */
export function filterRows(rows: VocabularyRow[], { search, status }: Filter): VocabularyRow[] {
  const needle = normalize(search.trim());
  return rows.filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      (!needle || normalize(row.english).includes(needle) || normalize(row.french).includes(needle)),
  );
}
