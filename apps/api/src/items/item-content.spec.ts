import { describe, expect, it } from 'vitest';
import { cardSlots } from './item-content.js';

const at = { x: 0, y: 0 };

describe('cardSlots', () => {
  it('gives a mind map one card per branch, staggered by a day, and none to deeper nodes', () => {
    const slots = cardSlots('MindMap', {
      nodes: [
        { id: 'root', parentId: null, label: 'Racine', position: at },
        { id: 'a', parentId: 'root', label: 'A', position: at },
        { id: 'a1', parentId: 'a', label: 'A1', position: at },
        { id: 'b', parentId: 'root', label: 'B', position: at },
      ],
    });

    expect(slots).toEqual([
      { kind: 'BranchRecall', nodeId: 'a', delayDays: 0 },
      { kind: 'BranchRecall', nodeId: 'b', delayDays: 1 },
    ]);
  });

  it('gives no card to a map that only has its root', () => {
    expect(cardSlots('MindMap', { nodes: [{ id: 'root', parentId: null, label: 'Racine', position: at }] })).toEqual([]);
  });

  it('keeps the fixed cards of quotes and vocabulary', () => {
    expect(cardSlots('Quote', { text: 'x', author: null, source: null }).map((s) => s.kind)).toEqual(['QuoteRecall']);
    expect(cardSlots('Vocabulary', { word: 'a', translation: 'b', example: null }).map((s) => s.kind)).toEqual([
      'EnglishToFrench',
      'FrenchToEnglish',
    ]);
  });
});
