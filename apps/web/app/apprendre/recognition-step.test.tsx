// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearningItem } from '../../lib/types';

// The loudspeaker is tested with the speech (step 2 never reads on its own).
const mounted = vi.fn();
vi.mock('../speech/speak-button', async () => {
  const { useEffect } = await import('react');
  return {
    usePronunciationAudio: () => false,
    Speakable: ({ text, children }: { text: string; children: React.ReactNode }) => {
      useEffect(() => mounted(text), [text]);
      return <div className="speakable">{children}</div>;
    },
  };
});
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { RecognitionStep } = await import('./recognition-step');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, word: string, translation: string): LearningItem =>
  ({
    id,
    cardId: `c${id}`,
    word,
    translation,
    example: null,
    nextDue: {},
    nextDueAfterAgain: {},
  }) as unknown as LearningItem;
const items = [item('1', 'a snag', 'un accroc'), item('2', 'a hitch', 'un contretemps')];

describe('Step 2 of the learning: « Réessayer » (MEM-126)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onDone: ReturnType<typeof vi.fn<() => void>>;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onDone = vi.fn<() => void>();
    mounted.mockClear();
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
    act(() => root.render(<RecognitionStep items={items} onDone={onDone} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('.review-card__reveal-row button')];
  const labels = () => buttons().map((button) => button.textContent!.replace(/\s+/g, ' ').trim());
  const answerHidden = () => container.querySelector('.recognition__answer')!.closest('[aria-hidden="true"]') !== null;
  const counter = () => container.querySelector('.review-progress span')!.textContent!.replace(/\s+/g, ' ');
  const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
    });

  it('the answer shown: « Réessayer » next to « Carte suivante », secondary', () => {
    expect(labels()).toEqual(['Afficher la réponse Espace']);
    act(() => buttons()[0].click());
    expect(answerHidden()).toBe(false);
    expect(labels()).toEqual(['Carte suivante Espace', 'Réessayer R']);
    expect(buttons()[1].className).toBe('review-card__retry');
  });

  it('hides the answer, on the same card, as many times as wanted; the focus on « Afficher la réponse »', () => {
    for (let i = 0; i < 3; i++) {
      act(() => buttons()[0].click()); // Afficher la réponse
      act(() => buttons()[1].click()); // Réessayer
      expect(answerHidden()).toBe(true);
      expect(counter()).toBe('1 / 2');
      expect(container.querySelector('blockquote')!.textContent).toBe('a snag');
      expect(document.activeElement?.textContent).toContain('Afficher la réponse');
    }
    expect(onDone).not.toHaveBeenCalled();
  });

  it('the key R, only with the answer shown; not with Ctrl, Alt or Meta', () => {
    key('r');
    expect(labels()).toEqual(['Afficher la réponse Espace']); // nothing to retry yet
    key(' ');
    expect(answerHidden()).toBe(false);
    key('r', { ctrlKey: true });
    key('R', { altKey: true });
    key('r', { metaKey: true });
    expect(answerHidden()).toBe(false);
    key('R');
    expect(answerHidden()).toBe(true);
    expect(counter()).toBe('1 / 2');
  });

  it('on the last card too, then « Passer à l’évaluation »; nothing sent, the English not read again', () => {
    key(' ');
    key(' '); // the next card
    expect(counter()).toBe('2 / 2');
    key(' ');
    expect(labels()).toEqual(['Passer à l’évaluation Espace', 'Réessayer R']);
    key('r');
    expect(answerHidden()).toBe(true);
    key(' ');
    key(' ');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    // The word with its loudspeaker, mounted once per card: « Réessayer » doesn't start it again.
    expect(mounted.mock.calls).toEqual([['a snag'], ['a hitch']]);
  });
});
