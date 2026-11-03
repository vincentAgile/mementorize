// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry, CatalogImportAnalysis } from '../../../../../lib/admin-api';
import { entryErrors } from '../../../../../lib/catalog';

vi.mock('./actions', () => ({
  saveEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  publishAction: vi.fn(),
  previewCatalogImportAction: vi.fn(),
  importCatalogAction: vi.fn(),
}));
// The dialogs' buttons come from the lists, whose actions are server ones.
vi.mock('../../../../lists/actions', () => ({}));
const { EntriesTable } = await import('./entries-table');
const { ImportPreview } = await import('./catalog-import');
const { PublishButton } = await import('./publish-button');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  id: 'e1',
  position: 1,
  french: 'un billet',
  english: 'a ticket',
  topic: null,
  frenchExample: null,
  englishExample: null,
  ...overrides,
});
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&#x27;|&#39;/g, '’')
    .replace(/\s+/g, ' ');

describe('EntriesTable (MEM-117)', () => {
  const entries = [
    entry({ id: 'e1', french: 'un billet', english: 'a ticket', topic: 'Gare', englishExample: 'One ticket, please.' }),
    entry({ id: 'e2', position: 2, french: 'un quai', english: 'a platform' }),
  ];
  const html = renderToStaticMarkup(<EntriesTable listId="l1" entries={entries} topics={['Gare']} />);

  it('the words in the order of the list: French, English, topic, and their actions', () => {
    const headers = [...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((match) => text(match[1]).trim());
    expect(headers).toEqual(['Expression française', 'Expression anglaise', 'Thématique', 'Actions']);
    const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].slice(1).map((match) => match[1]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('<td lang="fr">un billet</td><td lang="en">a ticket</td>');
    expect(rows[0]).toContain('<td class="item-list__topic">Gare</td>');
    expect(rows[1]).toContain('<td lang="en">a platform</td>');
    expect(html).toContain('aria-label="Modifier « a ticket »"');
    expect(html).toContain('aria-label="Supprimer « a platform »"');
  });

  it('the examples in the edit form, and the deletion keeps the users’ vocabularies', () => {
    expect(html).toContain('value="One ticket, please."');
    expect(text(html)).toContain('Les vocabulaires des utilisateurs ne changent pas');
  });

  it('no word yet: how to add some', () => {
    const empty = renderToStaticMarkup(<EntriesTable listId="l1" entries={[]} topics={[]} />);
    expect(text(empty)).toContain('Aucun mot pour le moment');
    expect(empty).not.toContain('<table');
  });
});

describe('PublishButton (MEM-117)', () => {
  it('« Publier » a draft, « Dépublier » a published list', () => {
    expect(renderToStaticMarkup(<PublishButton listId="l1" published={false} />)).toContain('>Publier</button>');
    expect(renderToStaticMarkup(<PublishButton listId="l1" published />)).toContain('>Dépublier</button>');
  });
});

describe('ImportPreview (MEM-117)', () => {
  const analysis = (room = 500): Extract<CatalogImportAnalysis, { ok: true }> => ({
    ok: true,
    room,
    summary: { total: 4, new: 2, duplicate: 1, error: 1 },
    rows: [
      {
        line: 2,
        french: 'un délai',
        english: 'a deadline',
        topic: 'Projets',
        frenchExample: '',
        example: 'Soon.',
        status: 'new',
      },
      {
        line: 3,
        french: 'une réunion',
        english: 'a meeting',
        topic: '',
        frenchExample: '',
        example: '',
        status: 'duplicate',
        languages: ['en'],
        of: { existing: 'a meeting → une réunion' },
      },
      {
        line: 4,
        french: '',
        english: 'a manager',
        topic: '',
        frenchExample: '',
        example: '',
        status: 'error',
        error: 'Expression française manquante',
      },
      {
        line: 5,
        french: 'un collègue',
        english: 'a colleague',
        topic: '',
        frenchExample: '',
        example: '',
        status: 'new',
      },
    ],
  });

  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  function render(room?: number) {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <ImportPreview
          analysis={analysis(room)}
          fileName="travail.csv"
          filter="all"
          onFilter={() => {}}
          onReset={() => {}}
          onImport={() => {}}
          importing={false}
        />,
      ),
    );
    return container;
  }

  it('the summary, a row per line with its status and why, and the confirmation', () => {
    const container = render();
    expect(text(container.innerHTML)).toContain('travail.csv : 4 lignes : 2 à importer, 1 doublon, 1 erreur.');
    const rows = [...container.querySelectorAll('tbody tr')].map((row) => row.className);
    expect(rows).toEqual(['import-row--new', 'import-row--duplicate', 'import-row--error', 'import-row--new']);
    const statuses = [...container.querySelectorAll('tbody tr td:last-child')].map((cell) =>
      text(cell.innerHTML).trim(),
    );
    expect(statuses).toEqual([
      'À importer',
      'Doublon déjà dans la liste : « a meeting → une réunion »',
      'Erreur Expression française manquante',
      'À importer',
    ]);
    const button = container.querySelector<HTMLButtonElement>('.import-preview__actions button')!;
    expect(text(button.textContent!)).toBe('Importer 2 mots');
    expect(button.disabled).toBe(false);
    expect(text(container.querySelector('dialog')!.innerHTML)).toContain(
      '2 mots seront ajoutés. Le doublon et la ligne en erreur ne seront pas intégrés.',
    );
    expect(container.querySelector('select')!.getAttribute('aria-label')).toBe('Filtrer par statut');
  });

  it('more words than the room left: refused, with the places left', () => {
    const container = render(1);
    expect(text(container.querySelector('[role="alert"]')!.textContent!)).toContain(
      'ce fichier ajouterait 2 mots, et il ne reste que 1 place dans la liste',
    );
    expect(container.querySelector<HTMLButtonElement>('.import-preview__actions button')!.disabled).toBe(true);
  });
});

describe('entryErrors (MEM-117): the checks of the « Ajouter » tab', () => {
  const values = { word: 'a ticket', example: '', translation: 'un billet', frenchExample: '', topic: '' };
  it('both expressions required, and the same lengths as the API', () => {
    expect(entryErrors(values)).toEqual({});
    expect(entryErrors({ ...values, word: '', translation: '' })).toEqual({
      word: 'Saisissez le mot, l’expression ou la phrase en anglais.',
      translation: 'Saisissez la traduction en français.',
    });
    expect(entryErrors({ ...values, topic: 'x'.repeat(51), example: 'x'.repeat(501) })).toEqual({
      topic: '50 caractères au plus.',
      example: '500 caractères au plus.',
    });
  });
});
