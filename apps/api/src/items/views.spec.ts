import { describe, expect, it } from 'vitest';
import type { ItemWithCards } from './items.service.js';
import { toQuoteView } from './quotes/quote-view.js';
import { toVocabularyView } from './vocabulary/vocabulary-view.js';

const NOW = new Date('2026-09-29T08:00:00Z');
const base = { id: 'item-1', userId: 'user-1', createdAt: NOW, updatedAt: NOW };

describe('API views', () => {
  it('flattens a quote item into the pre-phase-5 /quotes shape', () => {
    const item = {
      ...base,
      type: 'Quote',
      content: { text: 'Hello', author: 'Me', source: null },
      cards: [{ id: 'card-1', kind: 'QuoteRecall', due: NOW, state: 'New' }],
    } as ItemWithCards;

    expect(toQuoteView(item)).toEqual({
      ...base,
      text: 'Hello',
      author: 'Me',
      source: null,
      card: { due: NOW, state: 'New' },
    });
  });

  it('flattens a vocabulary item and lists its two cards', () => {
    const item = {
      ...base,
      type: 'Vocabulary',
      content: { word: 'to cherish', translation: 'chérir', example: null },
      cards: [
        { id: 'c1', kind: 'EnglishToFrench', due: NOW, state: 'New' },
        { id: 'c2', kind: 'FrenchToEnglish', due: NOW, state: 'New' },
      ],
    } as ItemWithCards;

    const view = toVocabularyView(item);

    expect(view).toMatchObject({ word: 'to cherish', translation: 'chérir', example: null });
    expect(view.cards.map((c) => c.kind)).toEqual(['EnglishToFrench', 'FrenchToEnglish']);
  });
});
