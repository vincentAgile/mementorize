import { contentOf } from '../item-content.js';
import type { ItemWithCards } from '../items.service.js';

export function toVocabularyView(item: ItemWithCards) {
  const { word, translation, example, frenchExample, topic } = contentOf(
    item as ItemWithCards & { type: 'Vocabulary' },
  );
  return {
    id: item.id,
    word,
    translation,
    example,
    frenchExample: frenchExample ?? null, // none on the items created before MEM-42
    topic: topic ?? null, // MEM-51
    learningStatus: item.learningStatus,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    cards: item.cards.map(({ kind, due, state }) => ({ kind, due, state })),
  };
}
