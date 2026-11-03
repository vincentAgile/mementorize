import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogList } from '../../../../lib/admin-api';

vi.mock('./actions', () => ({ saveCatalogListAction: vi.fn(), deleteCatalogListAction: vi.fn() }));
// The dialogs' buttons come from the lists, whose actions are server ones.
vi.mock('../../../lists/actions', () => ({}));
const { CatalogTable } = await import('./catalog-table');
const { CatalogForm } = await import('./catalog-form');

const list = (overrides: Partial<CatalogList>): CatalogList => ({
  id: 'l1',
  title: 'Voyage',
  description: null,
  level: 'A2',
  published: false,
  entries: 0,
  createdAt: '2026-11-03T10:00:00Z',
  updatedAt: '2026-11-03T10:00:00Z',
  ...overrides,
});
/** The box « Publiée », whatever the order of its attributes. */
const publishedBox = (html: string) => html.match(/<input type="checkbox"[^>]*name="published"[^>]*>/)![0];
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ');

describe('CatalogTable (MEM-116)', () => {
  const lists = [
    list({ id: 'l1', title: 'Voyage', level: 'A2', entries: 0 }),
    list({ id: 'l2', title: 'Travail', level: 'B2', entries: 1250, published: true }),
  ];
  const html = renderToStaticMarkup(<CatalogTable lists={lists} />);

  it('the columns, and a row per list: its title to its words, level, words, state', () => {
    const headers = [...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => text(match[1]).trim());
    expect(headers).toEqual(['Titre', 'Niveau', 'Mots', 'État', 'Actions']);
    expect(html).toContain('<a href="/admin/catalogue/l1">Voyage</a>');
    expect(text(html)).toContain('A2 · Élémentaire');
    expect(text(html)).toContain('B2 · Intermédiaire supérieur');
    expect(text(html)).toContain('1 250');
    expect(text(html)).toContain('Brouillon');
    expect(text(html)).toContain('Publiée');
  });

  it('« Nouvelle liste », and per list « Modifier » and « Supprimer », named for screen readers', () => {
    expect(html).toContain('>Nouvelle liste</button>');
    expect(html).toContain('aria-label="Modifier « Travail »"');
    expect(html).toContain('aria-label="Supprimer « Travail »"');
  });

  it('the deletion says how many words go, and that the users keep theirs', () => {
    expect(text(html)).toContain('Ses 1 250 mots seront supprimés aussi.');
    expect(text(html)).toContain('Elle ne contient aucun mot.');
    expect(text(html)).toContain('Les vocabulaires des utilisateurs ne changent pas');
  });

  it('no list yet: says how to make the first one', () => {
    expect(text(renderToStaticMarkup(<CatalogTable lists={[]} />))).toContain('Aucune liste pour le moment');
  });
});

describe('CatalogForm (MEM-116)', () => {
  it('a new list: empty, the level to choose among A1 to C2, not published, « Créer la liste »', () => {
    const html = renderToStaticMarkup(<CatalogForm idPrefix="new" />);
    const options = [...html.matchAll(/<option value="(\w*)"[^>]*>([^<]*)<\/option>/g)].map((match) => [
      match[1],
      match[2],
    ]);
    expect(options).toEqual([
      ['', 'Choisir un niveau'],
      ['A1', 'A1 · Débutant'],
      ['A2', 'A2 · Élémentaire'],
      ['B1', 'B1 · Intermédiaire'],
      ['B2', 'B2 · Intermédiaire supérieur'],
      ['C1', 'C1 · Autonome'],
      ['C2', 'C2 · Maîtrise'],
    ]);
    expect(publishedBox(html)).not.toContain('checked');
    expect(html).toContain('Créer la liste');
  });

  it('a list to change: its values, « Enregistrer »', () => {
    const html = renderToStaticMarkup(
      <CatalogForm
        idPrefix="edit"
        list={list({ title: 'Travail', level: 'C1', description: 'Au bureau', published: true, entries: 3 })}
      />,
    );
    expect(html).toContain('value="Travail"');
    expect(html).toMatch(/<option value="C1" selected="">/);
    expect(html).toContain('>Au bureau</textarea>');
    expect(publishedBox(html)).toContain('checked');
    expect(html).toContain('Enregistrer');
  });
});
