// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteContent } from '../../lib/types';
import { quoteFaces } from './quote-faces';
import { ReviewCard } from './review-card';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DE_GAULLE: QuoteContent = {
  text: 'La culture générale est la véritable école du commandement.',
  author: 'Général de Gaulle',
  source: 'Vers l’armée de métier',
  hint: 'Citation relative à l’importance de la culture générale',
};
const VOLTAIRE: QuoteContent = {
  text: 'Il faut cultiver notre jardin.',
  author: null,
  source: null,
  hint: 'Citation sur le travail et la sagesse pratique',
};

let container: HTMLDivElement;
let root: Root;
const onAnswer = vi.fn(async () => {});

function render(quote: QuoteContent, key: number) {
  act(() => root.render(<ReviewCard key={key} {...quoteFaces(quote)} withLearned onAnswer={onAnswer} />));
}
const html = () => container.innerHTML;
const button = (name: string) =>
  [...container.querySelectorAll('button')].find((element) => element.textContent?.includes(name));
const click = (element: Element | undefined) => {
  expect(element).toBeDefined();
  act(() => (element as HTMLElement).click());
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  onAnswer.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the card of a quote (MEM-108)', () => {
  it('shows the hint only: neither the author, the source, the start nor the text are in the page', () => {
    render(DE_GAULLE, 1);
    expect(container.textContent).toContain(DE_GAULLE.hint);
    expect(container.textContent).toContain('Citation');
    expect(html()).not.toMatch(/Gaulle|armée de métier|La culture générale est|commandement/);
    expect(container.textContent).not.toContain('Récite la suite');
    expect(button('Afficher l’auteur')?.getAttribute('aria-expanded')).toBe('false');
    expect(button('Afficher le début')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows each piece on its own, announced, and none of it is an answer', () => {
    render(DE_GAULLE, 1);
    click(button('Afficher l’auteur'));
    expect(container.textContent).toContain('Général de Gaulle · Vers l’armée de métier');
    expect(html()).not.toMatch(/La culture générale/);
    const startId = button('Afficher le début')!.getAttribute('aria-controls')!;
    const author = document.getElementById(startId.replace(/start$/, 'author'));
    expect(author?.textContent).toBe('Général de Gaulle · Vers l’armée de métier');
    expect(author?.getAttribute('aria-live')).toBe('polite');
    expect(button('Afficher l’auteur')).toBeUndefined();

    click(button('Afficher le début'));
    expect(container.textContent).toContain('La culture générale…');
    expect(html()).not.toMatch(/commandement/); // the rest of the text: only in the answer
    expect(onAnswer).not.toHaveBeenCalled();
    // The answer is not shown: the only rating buttons are the invisible copy that keeps their room.
    const ratings = [...container.querySelectorAll('.review-card__ratings')];
    expect(ratings.every((element) => element.closest('.review-card__reveal-room'))).toBe(true);
    expect(button('Afficher la réponse')).toBeDefined();
  });

  it('keeps what is shown until the answer, then hides it all again on the next card', () => {
    render(DE_GAULLE, 1);
    click(button('Afficher l’auteur'));
    click(button('Afficher la réponse'));
    expect(container.textContent).toContain(DE_GAULLE.text);
    expect(container.textContent).not.toContain(DE_GAULLE.hint); // not repeated on the back

    render(VOLTAIRE, 2);
    expect(container.textContent).toContain(VOLTAIRE.hint);
    expect(html()).not.toMatch(/Gaulle|cultiver notre jardin|Il faut/);
    expect(button('Afficher le début')).toBeDefined();
  });

  it('says « Auteur inconnu » without a button when there is no author nor source', () => {
    render(VOLTAIRE, 1);
    expect(container.textContent).toContain('Auteur inconnu');
    expect(button('Afficher l’auteur')).toBeUndefined();
    expect(button('Afficher la source')).toBeUndefined();
  });
});
