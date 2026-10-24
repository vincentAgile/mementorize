import { describe, expect, it } from 'vitest';
import type { ItemWithCards } from './items.service.js';
import { toMindMapContent, toMindMapView } from './mind-maps/mind-map-view.js';
import { toQuoteView } from './quotes/quote-view.js';
import { toVocabularyView } from './vocabulary/vocabulary-view.js';

const NOW = new Date('2026-09-29T08:00:00Z');
const base = { id: 'item-1', userId: 'user-1', createdAt: NOW, updatedAt: NOW };

describe('API views', () => {
  it('flattens a quote item into the pre-phase-5 /quotes shape, with its state (MEM-67)', () => {
    const item = {
      ...base,
      type: 'Quote',
      content: { text: 'Hello', author: 'Me', source: null },
      learningStatus: 'ToLearn',
      learnPosition: 2,
      cards: [{ id: 'card-1', kind: 'QuoteRecall', nodeId: null, due: NOW, state: 'New', learnedAt: null }],
    } as ItemWithCards;

    expect(toQuoteView(item)).toEqual({
      ...base,
      text: 'Hello',
      author: 'Me',
      source: null,
      learningStatus: 'ToLearn', // MEM-67
      learnPosition: 2,
      card: { id: 'card-1', due: NOW, state: 'New' },
    });
  });

  it('flattens a vocabulary item and lists its two cards', () => {
    const item = {
      ...base,
      type: 'Vocabulary',
      content: { word: 'to cherish', translation: 'chérir', example: null },
      cards: [
        { id: 'c1', kind: 'EnglishToFrench', nodeId: null, due: NOW, state: 'New' },
        { id: 'c2', kind: 'FrenchToEnglish', nodeId: null, due: NOW, state: 'New' },
      ],
    } as ItemWithCards;

    const view = toVocabularyView(item);

    // Created before MEM-42: no French example in the content, null in the view.
    expect(view).toMatchObject({
      word: 'to cherish',
      translation: 'chérir',
      example: null,
      frenchExample: null,
      topic: null, // MEM-51: none on the items created before it
    });
    expect(view.cards.map((c) => c.kind)).toEqual(['EnglishToFrench', 'FrenchToEnglish']);
  });

  it('names a mind map after its root and lists one card per branch', () => {
    const item = {
      ...base,
      type: 'MindMap',
      content: {
        nodes: [
          { id: 'root', parentId: null, label: 'Révolution française', position: { x: 0, y: 0 } },
          { id: 'a', parentId: 'root', label: 'Causes', position: { x: 200, y: 0 } },
        ],
      },
      cards: [{ id: 'c1', kind: 'BranchRecall', nodeId: 'a', due: NOW, state: 'New' }],
    } as ItemWithCards;

    const view = toMindMapView(item);

    expect(view.title).toBe('Révolution française');
    expect(view.nodes).toHaveLength(2);
    expect(view.cards).toEqual([{ id: 'c1', nodeId: 'a', due: NOW, state: 'New' }]);
  });

  it('stores rounded positions and nothing but the known fields', () => {
    const node = { id: 'root', parentId: null, label: 'Racine', position: { x: 10.6, y: -3.2 }, extra: true };

    expect(toMindMapContent([node])).toEqual({
      nodes: [{ id: 'root', parentId: null, label: 'Racine', position: { x: 11, y: -3 } }],
    });
  });
});
