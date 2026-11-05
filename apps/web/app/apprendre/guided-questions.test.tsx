// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DueItem, LearningItem } from '../../lib/types';

vi.mock('../speech/speak-button', () => ({
  usePronunciationAudio: () => false,
  Speakable: ({ children }: { children: React.ReactNode }) => <div className="speakable">{children}</div>,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../mind-maps/mind-map-viewer', () => ({ MindMapViewer: () => <div className="mind-map" /> }));
vi.mock('./pronunciation-practice', () => ({
  PronunciationFrame: () => null,
  PronunciationFramePlaceholder: () => null,
}));
vi.mock('../../lib/speech', () => ({ pronounce: vi.fn(), stopPronouncing: vi.fn() }));

const { RecognitionStep } = await import('./recognition-step');
const { LearningEvaluation } = await import('./learning-evaluation');
const { facesOf } = await import('../review/faces');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TO_FRENCH = 'Comment le dit-on en français ?';
const TO_ENGLISH = 'Comment le dit-on en anglais ?';
const dates = {
  Again: '2026-11-05T10:00:00Z',
  Hard: '2026-11-06T10:00:00Z',
  Good: '2026-11-08T10:00:00Z',
  Easy: '2026-11-12T10:00:00Z',
};
const item = {
  id: 'i1',
  cardId: 'c1',
  word: 'a snag',
  translation: 'un accroc',
  example: null,
  nextDue: dates,
  nextDueAfterAgain: dates,
} as unknown as LearningItem;

describe('The questions of the Guided mode (MEM-128)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const question = () => container.querySelector('.review-card__question');
  const reveal = () => act(() => container.querySelector<HTMLButtonElement>('.review-card__reveal')!.click());

  it('step 2, Guided: « Comment le dit-on en français ? » under the English, in its region; then only its room', () => {
    act(() => root.render(<RecognitionStep items={[item]} guided onDone={() => {}} />));
    expect(question()!.textContent).toBe(TO_FRENCH);
    // Right after the word, in the card: read with it.
    expect(question()!.previousElementSibling!.textContent).toBe('a snag');
    expect(question()!.getAttribute('aria-hidden')).toBeNull();
    reveal();
    expect(question()!.className).toContain('review-card__question--ghost');
    expect(question()!.getAttribute('aria-hidden')).toBe('true');
  });

  it('step 2, Autonomous: no question', () => {
    act(() => root.render(<RecognitionStep items={[item]} onDone={() => {}} />));
    expect(question()).toBeNull();
  });

  it('step 3, Guided: « Comment le dit-on en anglais ? » under the French, read once; gone with the answer', () => {
    const render = (guided: boolean) =>
      act(() =>
        root.render(
          <LearningEvaluation
            items={[item]}
            now="2026-11-05T09:00:00Z"
            showDelays={false}
            canAssess={false}
            guided={guided}
            onItemDone={() => {}}
            onFinished={() => {}}
          />,
        ),
      );
    render(true);
    const questions = [...container.querySelectorAll('.review-card__question')];
    // The visible one, and the same in the hidden copy that keeps the room: never read twice.
    const shown = questions.filter((q) => !q.closest('[aria-hidden="true"]'));
    expect(shown.map((q) => q.textContent)).toEqual([TO_ENGLISH]);
    expect(shown[0].previousElementSibling!.textContent).toBe('un accroc');
    reveal();
    expect(
      [...container.querySelectorAll('.review-card__question')].filter((q) => !q.closest('[aria-hidden="true"]')),
    ).toEqual([]);

    act(() => root.unmount());
    root = createRoot(container);
    render(false);
    expect(question()).toBeNull();
  });
});

describe('The review (MEM-128)', () => {
  const due = (item: unknown, kind = 'FrenchToEnglish', nodeId: string | null = null): DueItem =>
    ({
      item,
      card: { id: 'c', kind, nodeId, due: '', state: 'Review', reps: 1, lapses: 0 },
      nextDue: dates,
    }) as DueItem;
  const vocabulary = {
    id: 'v',
    type: 'Vocabulary',
    content: { word: 'a snag', translation: 'un accroc', example: null },
  };

  it('the vocabulary: the question in the Guided mode only, never on the answer', () => {
    expect(facesOf(due(vocabulary), false, true).front.prompt).toBe(TO_ENGLISH);
    expect(facesOf(due(vocabulary), false, true).back.prompt).toBeUndefined();
    expect(facesOf(due(vocabulary), false, false).front.prompt).toBeUndefined();
  });

  it('the quotes and the mind maps: nothing new, whatever the mode', () => {
    const quote = {
      id: 'q',
      type: 'Quote',
      content: { text: 'Carpe diem', author: 'Horace', source: null, hint: 'Le jour' },
    };
    expect(facesOf(due(quote, 'QuoteRecall'), false, true)).toEqual(facesOf(due(quote, 'QuoteRecall'), false, false));
    const map = {
      id: 'm',
      type: 'MindMap',
      content: {
        nodes: [
          { id: 'r', parentId: null, label: 'Racine', position: { x: 0, y: 0 } },
          { id: 'b', parentId: 'r', label: 'Branche', position: { x: 1, y: 1 } },
        ],
      },
    };
    const guided = facesOf(due(map, 'BranchRecall', 'b'), false, true).front.prompt;
    expect(guided).toBe(facesOf(due(map, 'BranchRecall', 'b'), false, false).front.prompt);
    expect(guided).not.toContain('Comment le dit-on');
  });
});
