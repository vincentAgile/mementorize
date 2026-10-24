import { collator, COMMON_SORTS, distinctValues, type ListRow, normalize, type SortSpec } from './item-list';
import type { Item, QuoteContent } from './types';

/**
 * The rows of the list of the quotes (MEM-69): its columns, how they sort,
 * what the search looks at. The rest is shared with the vocabulary table
 * (lib/item-list.ts).
 */

export type QuoteItem = Item & { type: 'Quote'; content: QuoteContent };

export interface QuoteRow extends ListRow {
  text: string;
  author: string | null;
  source: string | null;
}

export function toQuoteRow(item: QuoteItem): QuoteRow {
  const card = item.cards?.[0];
  return {
    id: item.id,
    text: item.content.text,
    author: item.content.author,
    source: item.content.source,
    status: item.learningStatus,
    position: item.learningStatus === 'ToLearn' ? (item.learnPosition ?? null) : null,
    createdAt: new Date(item.createdAt).getTime(),
    nextDue: item.learningStatus === 'Learning' && card ? new Date(card.due).getTime() : null,
  };
}

/** The sortable columns: those of every list, and the text, the author, the source (missing ones last). */
export const QUOTE_SORTS: Record<string, SortSpec<QuoteRow>> = {
  ...COMMON_SORTS,
  text: { compare: (a, b) => collator.compare(a.text, b.text) },
  author: { compare: (a, b) => collator.compare(a.author!, b.author!), missing: (row) => row.author === null },
  source: { compare: (a, b) => collator.compare(a.source!, b.source!), missing: (row) => row.source === null },
};

/** A single search in the text, the author and the source, ignoring case and accents. */
export function matchesQuote(row: QuoteRow, needle: string): boolean {
  return !needle || [row.text, row.author, row.source].some((value) => value && normalize(value).includes(needle));
}

/** The authors already entered, once each, in alphabetical order: the suggestions of the author field (MEM-71). */
export const authorsOf = (items: { content: QuoteContent }[]) =>
  distinctValues(items.map((item) => item.content.author));
