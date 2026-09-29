import { contentOf } from '../item-content.js';
import type { ItemWithCards } from '../items.service.js';

export function toVocabularyView(item: ItemWithCards) {
  const { word, translation, example } = contentOf(item as ItemWithCards & { type: 'Vocabulary' });
  return {
    id: item.id,
    word,
    translation,
    example,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    cards: item.cards.map(({ kind, due, state }) => ({ kind, due, state })),
  };
}
