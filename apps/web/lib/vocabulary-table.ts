import {
  ALL_TOPICS,
  collator,
  COMMON_SORTS,
  distinctValues,
  type Filter,
  type ListRow,
  NO_TOPIC,
  normalize,
  type SortSpec,
} from './item-list';
import type { Item, VocabularyContent } from './types';

/**
 * The rows of the vocabulary table (MEM-16): its columns, how they sort
 * (MEM-17), what the search and the topic filter look at (MEM-18, MEM-56).
 * The rest is shared with the list of the quotes (lib/item-list.ts).
 */

export type VocabularyItem = Item & { type: 'Vocabulary'; content: VocabularyContent };

export interface VocabularyRow extends ListRow {
  english: string;
  french: string;
  example: string | null;
  /** MEM-42 */
  frenchExample: string | null;
  /** MEM-51 */
  topic: string | null;
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

/** The sortable columns (MEM-17): those of every list, and the English, the French, the topic. */
export const VOCABULARY_SORTS: Record<string, SortSpec<VocabularyRow>> = {
  ...COMMON_SORTS,
  english: { compare: (a, b) => collator.compare(a.english, b.english) },
  french: { compare: (a, b) => collator.compare(a.french, b.french) },
  topic: { compare: (a, b) => collator.compare(a.topic!, b.topic!), missing: (row) => row.topic === null },
};

const sameTopic = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

/** The search looks in the English and the French (MEM-18); the topic filter (MEM-56). */
export function matchesVocabulary(row: VocabularyRow, needle: string, { topic }: Filter): boolean {
  return (
    (topic === ALL_TOPICS ||
      (topic === NO_TOPIC ? row.topic === null : row.topic !== null && sameTopic(row.topic, topic))) &&
    (!needle || normalize(row.english).includes(needle) || normalize(row.french).includes(needle))
  );
}

/** The topics in use (MEM-51), once each, in alphabetical order: the suggestions of the topic field. */
export const topicsOf = distinctValues;
