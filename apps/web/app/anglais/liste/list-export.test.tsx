import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { separatorName } from '../../../lib/csv-separator';

const getItems = vi.fn();
const getPreferences = vi.fn();
const exportCsv = vi.fn();
vi.mock('../../../lib/api', () => ({ getItems, getPreferences, exportCsv }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
// The table itself is tested with the lists; here, only what is above it.
vi.mock('../vocabulary-table', () => ({ VocabularyTable: () => <table data-testid="table" /> }));

const { default: EnglishListPage } = await import('./page');
const newRoute = await import('./export/route');
const oldRoute = await import('../import-export/export/route');

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const item = (id: string) => ({ id, type: 'Vocabulary', content: { word: id, translation: id }, cards: [] });
const page = async () => renderToStaticMarkup(await EnglishListPage({ searchParams: Promise.resolve({}) }));

describe('« Exporter en CSV » in « Ma liste » (MEM-122)', () => {
  beforeEach(() => {
    getPreferences.mockResolvedValue({
      translator: 'DeepL',
      vocabularyPageSize: 50,
      usageMode: 'Standard',
      csvSeparator: ';',
    });
  });

  it('above the table, a download link; every card counted; the separator and where to change it', async () => {
    getItems.mockResolvedValue([item('a'), item('b'), item('c')]);
    const html = await page();
    expect(html.indexOf('list-export')).toBeLessThan(html.indexOf('data-testid="table"'));
    expect(html).toMatch(
      /<a href="\/anglais\/liste\/export" class="list-export__button" download="" title="Exporte les 3\u00a0cartes">Exporter en CSV<\/a>/,
    );
    expect(text(html)).toContain('Exporte les 3 cartes, quel que soit leur état · séparateur');
    expect(html).toContain(`<strong>${separatorName(';')}</strong>`);
    expect(html).toContain('<a href="/reglages/saisie#csv">Changer dans les Réglages</a>');
  });

  it('a single card: said so', async () => {
    getItems.mockResolvedValue([item('a')]);
    expect(text(await page())).toContain('Exporte la carte, quel que soit son état');
  });

  it('no card: no button, the message alone', async () => {
    getItems.mockResolvedValue([]);
    const html = await page();
    expect(html).not.toContain('Exporter en CSV');
    expect(text(html)).toBe('Aucune carte pour le moment. Ajouter une première carte');
  });
});

describe('The routes of the export (MEM-122)', () => {
  const file = () => ({
    ok: true,
    body: new Blob(['\uFEFFExpression française;Expression anglaise\r\nun accroc;a snag\r\n']).stream(),
    disposition: 'attachment; filename="mementorize-anglais-2026-11-04.csv"',
  });

  it('/anglais/liste/export: the file of the API, its name, not cached', async () => {
    exportCsv.mockResolvedValue(file());
    const res = await newRoute.GET();
    expect(exportCsv).toHaveBeenCalledWith('Vocabulary');
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="mementorize-anglais-2026-11-04.csv"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // The bytes as they are, the BOM included (Response.text() would drop it).
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())).toBe(
      '\uFEFFExpression française;Expression anglaise\r\nun accroc;a snag\r\n',
    );
  });

  it('the old address /anglais/import-export/export answers the same', async () => {
    exportCsv.mockResolvedValue(file());
    const before = await newRoute.GET();
    exportCsv.mockResolvedValue(file());
    const after = await oldRoute.GET();
    expect([...after.headers]).toEqual([...before.headers]);
    expect(await after.text()).toBe(await before.text());
  });
});
