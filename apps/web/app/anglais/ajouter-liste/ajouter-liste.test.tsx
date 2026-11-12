import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const getCatalogLists = vi.fn();
const getPreferences = vi.fn();
const getAiListStatus = vi.fn(async () => ({ enabled: true, remaining: 7 }));
vi.mock('../../../lib/api', () => ({ getCatalogLists, getPreferences, getAiListStatus }));
vi.mock('../../csv/import-section', () => ({
  ImportSection: ({ separator }: { separator: string }) => <section data-import={separator} />,
}));
vi.mock('./predefinies/actions', () => ({ addFromListAction: vi.fn() }));

const { default: AddListPage } = await import('./page');
const { default: ImportFilePage } = await import('./fichier/page');
const { default: PredefinedListsPage } = await import('./predefinies/page');
const { default: nextConfig } = await import('../../../next.config');

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
const list = { id: 'l1', title: 'Voyage', description: null, level: 'A2', entries: 3, owned: 0 };

describe('« Ajouter une liste »: the three choices (MEM-123, MEM-140)', () => {
  it('three links in this order, the AI first, each read with its explanation', async () => {
    getCatalogLists.mockResolvedValue([list]);
    const html = renderToStaticMarkup(await AddListPage());
    const links = [...html.matchAll(/<a class="add-list__choice" aria-describedby="([^"]+)" href="([^"]+)">/g)];
    expect(links.map((m) => m[2])).toEqual([
      '/anglais/ajouter-liste/ia',
      '/anglais/ajouter-liste/predefinies',
      '/anglais/ajouter-liste/fichier',
    ]);
    for (const [, id] of links) expect(html).toContain(`id="${id}"`);
    expect(text(html)).toContain('Générer avec l’IA Choisis un niveau et un thème, l’IA te propose des cartes.');
    expect(text(html)).toContain('Liste prédéfinie Choisis une liste par niveau (A1 à C2) proposée par Mementorize.');
    expect(text(html)).toContain(
      'Importer un fichier Charge un fichier CSV de cartes, par exemple exporté depuis Ma liste.',
    );
  });

  it('no predefined list published: that choice stays, off, and says so; the file still offered', async () => {
    getCatalogLists.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AddListPage());
    expect(html).toMatch(/<div class="add-list__choice is-disabled" aria-disabled="true"[^>]*>.*Liste prédéfinie/);
    expect(text(html)).toContain('Aucune liste disponible pour le moment.');
    expect(html).not.toContain('href="/anglais/ajouter-liste/predefinies"');
    expect(html).toContain('href="/anglais/ajouter-liste/fichier"');
  });

  it('no AI configured: the first choice stays, greyed, and says so', async () => {
    getCatalogLists.mockResolvedValue([list]);
    getAiListStatus.mockResolvedValueOnce({ enabled: false, remaining: 0 });
    const html = renderToStaticMarkup(await AddListPage());
    expect(html).toMatch(/<div class="add-list__choice is-disabled" aria-disabled="true"[^>]*>.*Générer avec l’IA/);
    expect(text(html)).toContain('L’IA n’est pas disponible pour le moment.');
    expect(html).not.toContain('href="/anglais/ajouter-liste/ia"');
  });

  it('the quota reached: the first choice greyed, and why; the count of the day is never shown', async () => {
    getCatalogLists.mockResolvedValue([list]);
    getAiListStatus.mockResolvedValueOnce({ enabled: true, remaining: 0 });
    const html = renderToStaticMarkup(await AddListPage());
    expect(html).toMatch(/<div class="add-list__choice is-disabled" aria-disabled="true"[^>]*>.*Générer avec l’IA/);
    expect(text(html)).toContain('Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.');
    expect(html).not.toContain('href="/anglais/ajouter-liste/ia"');
    getAiListStatus.mockResolvedValueOnce({ enabled: true, remaining: 3 });
    const open = renderToStaticMarkup(await AddListPage());
    expect(open).toContain('href="/anglais/ajouter-liste/ia"');
    expect(text(open)).not.toMatch(/générations? restantes?/);
  });
});

describe('The pages under « Ajouter une liste » (MEM-123)', () => {
  it('« Importer un fichier »: back to the choice, the separator, the import, and where the export went', async () => {
    getPreferences.mockResolvedValue({ csvSeparator: ';' });
    const html = renderToStaticMarkup(await ImportFilePage());
    expect(html).toContain('<a href="/anglais/ajouter-liste">← Retour au choix</a>');
    expect(html).toContain('<section data-import=";"></section>');
    expect(html).toContain('<a href="/reglages/import-export#csv">Changer dans les Réglages</a>');
    expect(text(html)).toContain('Pour exporter tes cartes, va dans Ma liste .');
    expect(html).toContain('<a href="/anglais/liste">Ma liste</a>');
    expect(html).not.toContain('Exporter en CSV');
  });

  it('« Liste prédéfinie »: back to the choice, at the top', async () => {
    getCatalogLists.mockResolvedValue([list]);
    const html = renderToStaticMarkup(await PredefinedListsPage({ searchParams: Promise.resolve({}) }));
    expect(html.indexOf('← Retour au choix')).toBeLessThan(html.indexOf('level-filter'));
  });
});

describe('The former addresses (MEM-123)', () => {
  it('redirect, for good, to the new ones; the export keeps its own', async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/anglais/listes-predefinies', destination: '/anglais/ajouter-liste/predefinies', permanent: true },
        {
          source: '/anglais/listes-predefinies/:id',
          destination: '/anglais/ajouter-liste/predefinies/:id',
          permanent: true,
        },
        { source: '/anglais/import-export', destination: '/anglais/ajouter-liste/fichier', permanent: true },
      ]),
    );
    // Only the page: /anglais/import-export/export is still a route.
    expect(redirects.some((rule) => rule.source.startsWith('/anglais/import-export/'))).toBe(false);
    expect(() => readFileSync(new URL('../import-export/export/route.ts', import.meta.url))).not.toThrow();
  });

  it('a guard: no link to them is left in the sources, but the redirections', () => {
    const web = fileURLToPath(new URL('../../..', import.meta.url)); // apps/web
    const api = join(web, '../api/src');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return ['node_modules', '.next'].includes(name) ? [] : files(path);
        return /\.(tsx?|html|hbs)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
      });
    const OLD = /\/anglais\/(listes-predefinies|import-export)(?![\w-])(?!\/export)/;
    const found = [...files(join(web, 'app')), ...files(join(web, 'lib')), ...files(api)].flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (OLD.test(line) ? [`${relative(web, path)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(found).toEqual([]);
    expect(readFileSync(join(web, 'next.config.ts'), 'utf8')).toMatch(OLD);
  });
});
