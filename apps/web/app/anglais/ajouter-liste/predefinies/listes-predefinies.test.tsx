// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogListDetail, CatalogListSummary } from '../../../../lib/types';

const addFromListAction = vi.fn();
vi.mock('./actions', () => ({ addFromListAction }));
const getCatalogLists = vi.fn();
vi.mock('../../../../lib/api', () => ({ getCatalogLists }));

const { ListCard } = await import('./list-card');
const { default: PredefinedListsPage } = await import('./page');
const { ListContent } = await import('./[id]/list-content');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();

const summary = (overrides: Partial<CatalogListSummary>): CatalogListSummary => ({
  id: 'l1',
  title: 'Voyage',
  description: 'À l’aéroport',
  level: 'A2',
  entries: 40,
  owned: 0,
  ...overrides,
});

describe('The lists, as cards (MEM-118)', () => {
  it('a card: the level written out, title, description, words, those already there, its two actions', () => {
    const html = renderToStaticMarkup(<ListCard list={summary({ owned: 12 })} />);
    expect(html).toContain('<span class="level-badge level-badge--a">A2 · Élémentaire</span>');
    expect(text(html)).toContain('Voyage À l’aéroport 40 mots · 12 déjà dans ma liste');
    expect(html).toContain('href="/anglais/ajouter-liste/predefinies/l1"');
    expect(text(html)).toContain('Voir le contenu');
    expect(html).toMatch(/<button type="button"[^>]*>Tout ajouter<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it('every word already there: « Tout ajouter » off, and why', () => {
    const html = renderToStaticMarkup(<ListCard list={summary({ owned: 40 })} />);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Tout ajouter<\/button>/);
    expect(text(html)).toContain('Tout est déjà dans ta liste');
  });

  const lists = [
    summary({ id: 'a', level: 'A1', title: 'Les bases' }),
    summary({ id: 'b', level: 'A2', title: 'Voyage' }),
    summary({ id: 'c', level: 'A2', title: 'Zoo' }),
    summary({ id: 'd', level: 'C1', title: 'Débats' }),
  ];
  const page = async (niveau?: string) =>
    renderToStaticMarkup(await PredefinedListsPage({ searchParams: Promise.resolve({ niveau }) }));

  it('the filter: Tous then each level, with its number of lists; a level without any is off', async () => {
    getCatalogLists.mockResolvedValue(lists);
    const html = await page();
    const chips = [...html.matchAll(/class="level-filter__chip([^"]*)"[^>]*aria-label="([^"]+)"/g)].map((m) => [
      m[2].replace(/\u00a0/g, ' '),
      m[1].trim(),
    ]);
    expect(chips).toEqual([
      ['Tous, 4 listes', 'is-active'],
      ['A1 · Débutant, 1 liste', ''],
      ['A2 · Élémentaire, 2 listes', ''],
      ['B1 · Intermédiaire, 0 liste', 'is-disabled'],
      ['B2 · Intermédiaire supérieur, 0 liste', 'is-disabled'],
      ['C1 · Autonome, 1 liste', ''],
      ['C2 · Maîtrise, 0 liste', 'is-disabled'],
    ]);
    expect(html).toContain('href="/anglais/ajouter-liste/predefinies?niveau=A2"');
    expect(html.match(/<article/g)).toHaveLength(4);
  });

  it('?niveau=A2: the lists of that level only, its chip active', async () => {
    getCatalogLists.mockResolvedValue(lists);
    const html = await page('A2');
    expect([...html.matchAll(/<h2 id="catalog-list-(\w)"/g)].map((m) => m[1])).toEqual(['b', 'c']);
    expect(html).toMatch(/class="level-filter__chip is-active"[^>]*aria-current="true"[^>]*aria-label="A2/);
  });

  it('no list, or none at the level chosen: says so', async () => {
    getCatalogLists.mockResolvedValue([]);
    expect(text(await page())).toContain('Aucune liste prédéfinie pour le moment.');
    getCatalogLists.mockResolvedValue(lists);
    expect(text(await page('B2'))).toContain('Aucune liste de niveau B2 pour le moment.');
  });
});

describe('The content of a list (MEM-118)', () => {
  const list: CatalogListDetail = {
    id: 'l1',
    title: 'Voyage',
    description: null,
    level: 'A2',
    entries: [
      {
        id: 'e1',
        english: 'a ticket',
        french: 'un billet',
        topic: 'Gare',
        frenchExample: null,
        englishExample: null,
        owned: false,
      },
      {
        id: 'e2',
        english: 'a platform',
        french: 'un quai',
        topic: null,
        frenchExample: null,
        englishExample: null,
        owned: true,
      },
      {
        id: 'e3',
        english: 'a delay',
        french: 'un retard',
        topic: null,
        frenchExample: null,
        englishExample: null,
        owned: false,
      },
    ],
  };
  let container: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    addFromListAction.mockReset();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
  });
  const mount = () => {
    root = createRoot(container);
    act(() => root!.render(<ListContent list={list} />));
  };
  const boxes = () => [...container.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')];
  const button = () => container.querySelector<HTMLButtonElement>('.catalog-content__bar button')!;

  it('every word checked, but those already there: greyed, unchecked, off, « Déjà dans ma liste »', () => {
    mount();
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers.slice(1)).toEqual(['Expression anglaise', 'Expression française', 'Thématique']);
    expect(boxes().map((box) => [box.checked, box.disabled])).toEqual([
      [true, false],
      [false, true],
      [true, false],
    ]);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[1].className).toBe('is-owned');
    expect(rows[1].textContent).toContain('Déjà dans ma liste');
    expect(text(button().textContent!)).toBe('Ajouter 2 cartes');
    // The choice of the queue, « à apprendre » by default.
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[name=queue]')];
    expect(radios.map((radio) => [radio.value, radio.checked])).toEqual([
      ['on', true],
      ['off', false],
    ]);
    expect(radios[1].parentElement!.textContent).toBe('Mettre les cartes en attente');
  });

  it('the boxes count; « Tout décocher » then nothing to add', () => {
    mount();
    act(() => boxes()[0].click());
    expect(text(button().textContent!)).toBe('Ajouter 1 carte');
    const all = container.querySelector<HTMLInputElement>('thead input')!;
    expect(all.indeterminate).toBe(true);
    act(() => all.click()); // checks them all
    expect(text(button().textContent!)).toBe('Ajouter 2 cartes');
    act(() => all.click());
    expect(text(button().textContent!)).toBe('Ajouter 0 carte');
    expect(button().disabled).toBe(true);
  });

  it('adds the words checked, in the order of the list, with the choice of the queue; then the message', async () => {
    addFromListAction.mockResolvedValue({ added: 1, skipped: 1, queue: false });
    mount();
    act(() => container.querySelector<HTMLInputElement>('input[name=queue][value=off]')!.click());
    await act(async () => button().click());
    expect(addFromListAction).toHaveBeenCalledWith('l1', ['e1', 'e3'], false);
    const message = container.querySelector('[role=status]')!;
    expect(message.textContent!.replace(/\s+/g, ' ')).toBe(
      '1 carte ajoutée, en attente, 1 déjà présente ignorée. Voir dans ma listeApprendre',
    );
    expect(message.querySelector('a')!.getAttribute('href')).toBe('/anglais/liste?etat=Waiting');
  });

  it('a failure: the message, nothing added', async () => {
    addFromListAction.mockResolvedValue({ error: 'L’ajout a échoué : aucune carte n’a été ajoutée. Réessaie.' });
    mount();
    await act(async () => button().click());
    expect(container.querySelector('[role=alert]')!.textContent).toContain('aucune carte n’a été ajoutée');
  });
});
