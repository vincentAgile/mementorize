// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathname = '/anglais';
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`);
});
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  redirect,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const getPreferences = vi.fn();
vi.mock('../lib/api', () => ({ getPreferences }));
vi.mock('server-only', () => ({}));
const saveMindMapsEnabledAction = vi.fn(async () => ({ ok: true }));
vi.mock('./reglages/actions', () => ({
  saveMindMapsEnabledAction,
  saveHomeSpaceAction: vi.fn(),
  saveRetentionAction: vi.fn(),
}));

const { MainNav } = await import('./main-nav');
const { MindMapsForm } = await import('./reglages/mind-maps-form');
const { HomeSpaceForm } = await import('./reglages/home-space-form');
const { RetentionForm } = await import('./reglages/retention-form');
const { default: HomePage } = await import('./page');
const { requireMindMaps } = await import('../lib/mind-maps-access');
const { visibleSpaces, visibleTypes } = await import('../lib/spaces');
const { mindMapsEnabledOf } = await import('../lib/types');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const due = { total: 0, byType: { Vocabulary: 2, Quote: 0, MindMap: 1 } } as never;

describe('« Espace cartes mentales »: the menu', () => {
  it('off (the default): Anglais, Citations and Ressources; three columns on a phone', () => {
    const html = renderToStaticMarkup(<MainNav due={due} mindMaps={false} />);
    expect([...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1])).toEqual([
      '/anglais',
      '/citations',
      '/ressources',
    ]);
    expect(html).toContain('class="page__nav page__nav--3"');
    expect(html).not.toContain('Cartes mentales');
  });

  it('on: Cartes mentales back, between Anglais and Citations', () => {
    const html = renderToStaticMarkup(<MainNav due={due} mindMaps />);
    expect([...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1])).toEqual([
      '/anglais',
      '/cartes-mentales',
      '/citations',
      '/ressources',
    ]);
    expect(html).toContain('class="page__nav"');
  });

  it('the spaces shown, and off while the API doesn’t send the setting yet', () => {
    expect(visibleSpaces(false).map((space) => space.label)).toEqual(['Anglais', 'Citations']);
    expect(visibleTypes(true)).toEqual(['Vocabulary', 'MindMap', 'Quote']);
    expect(mindMapsEnabledOf({})).toBe(false);
    expect(mindMapsEnabledOf({ mindMapsEnabled: true })).toBe(true);
  });
});

describe('« Espace cartes mentales »: its addresses', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it('off: the pages of the space go back to the home page; on: they open', async () => {
    getPreferences.mockResolvedValue({ mindMapsEnabled: false });
    await expect(requireMindMaps()).rejects.toThrow('NEXT_REDIRECT /');
    getPreferences.mockResolvedValue({ mindMapsEnabled: true });
    await expect(requireMindMaps()).resolves.toBeUndefined();
  });

  it('the home page Cartes mentales while the space is off: Anglais', async () => {
    getPreferences.mockResolvedValue({ homeSpace: 'MindMap', mindMapsEnabled: false });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT /anglais');
    getPreferences.mockResolvedValue({ homeSpace: 'MindMap', mindMapsEnabled: true });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT /cartes-mentales');
  });
});

describe('« Espace cartes mentales »: the settings', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    saveMindMapsEnabledAction.mockClear();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const select = (name: string) => container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;

  it('Désactivé by default, Activé; saved at the selection, as a boolean', async () => {
    act(() => root.render(<MindMapsForm enabled={false} />));
    expect(container.querySelector('h2')!.textContent).toBe('Espace cartes mentales');
    expect(select('mindMapsEnabled').value).toBe('Disabled');
    expect([...select('mindMapsEnabled').options].map((option) => option.textContent)).toEqual(['Désactivé', 'Activé']);
    await act(async () => {
      select('mindMapsEnabled').value = 'Enabled';
      select('mindMapsEnabled').dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(saveMindMapsEnabledAction).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('Enregistré ✓');
  });

  it('off: Cartes mentales offered neither as the home page nor in the target retention', () => {
    act(() => root.render(<HomeSpaceForm homeSpace="MindMap" mindMaps={false} />));
    expect([...select('homeSpace').options].map((option) => option.textContent)).toEqual(['Anglais', 'Citations']);
    expect(select('homeSpace').value).toBe('Vocabulary');
    act(() =>
      root.render(
        <RetentionForm retentions={{ Vocabulary: 90, Quote: 90, MindMap: 90 }} types={visibleTypes(false)} />,
      ),
    );
    expect([...container.querySelectorAll('select')].map((s) => s.name)).toEqual([
      'retention-Vocabulary',
      'retention-Quote',
    ]);
  });
});
