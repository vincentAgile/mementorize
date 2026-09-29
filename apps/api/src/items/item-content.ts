import type { CardKind, Item, ItemType } from '@prisma/client';

// Shape of the jsonb `content` column for each item type. Declared as
// `type` (not `interface`) so Prisma accepts them as JSON values.
export type QuoteContent = {
  text: string;
  author: string | null;
  source: string | null;
};

export type VocabularyContent = {
  word: string; // English
  translation: string; // French
  example: string | null; // example sentence, in English
};

export type ContentByType = {
  Quote: QuoteContent;
  Vocabulary: VocabularyContent;
};

/** Runtime list of item types (for validation), in sync with the Prisma enum. */
export const ITEM_TYPES = { Quote: 'Quote', Vocabulary: 'Vocabulary' } as const satisfies Record<ItemType, ItemType>;

/**
 * Cards created with each item. A vocabulary word gets one card per
 * direction; the reverse card starts one day later so the two sides of the
 * same word aren't asked back to back (a simple take on Anki's "burying"
 * of sibling cards).
 */
export const CARD_TEMPLATES: Record<ItemType, readonly { kind: CardKind; delayDays: number }[]> = {
  Quote: [{ kind: 'QuoteRecall', delayDays: 0 }],
  Vocabulary: [
    { kind: 'EnglishToFrench', delayDays: 0 },
    { kind: 'FrenchToEnglish', delayDays: 1 },
  ],
};

/** Typed view of an item's content (the database only knows it's JSON). */
export function contentOf<T extends ItemType>(item: Pick<Item, 'content'> & { type: T }): ContentByType[T] {
  return item.content as unknown as ContentByType[T];
}
