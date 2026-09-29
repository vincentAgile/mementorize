import { contentOf } from '../item-content.js';
import type { ItemWithCards } from '../items.service.js';

/**
 * Flattens an item back into the shape GET /quotes returned before phase 5,
 * so existing API clients keep working even though the storage changed.
 */
export function toQuoteView(item: ItemWithCards) {
  const { text, author, source } = contentOf(item as ItemWithCards & { type: 'Quote' });
  const card = item.cards[0];
  return {
    id: item.id,
    text,
    author,
    source,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    card: card ? { due: card.due, state: card.state } : null,
  };
}
