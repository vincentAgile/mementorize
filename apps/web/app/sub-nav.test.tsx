// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { SubNav } = await import('./sub-nav');
const { HeaderTitle } = await import('./header-title');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SubNav and HeaderTitle: the tabs of « Mes statistiques » (MEM-113)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    Element.prototype.scrollIntoView = () => {};
  });
  // Unmounted while the page is there: no React work left after the test.
  const unmount = () => {
    act(() => root?.unmount());
    root = null;
  };
  afterEach(() => {
    unmount();
    container.remove();
  });
  const mount = (node: React.ReactNode) => {
    unmount();
    root = createRoot(container);
    act(() => root!.render(node));
  };

  const render = (at: string) => {
    pathname = at;
    mount(<SubNav />);
    const nav = container.querySelector('nav');
    return {
      label: nav?.getAttribute('aria-label'),
      tabs: [...container.querySelectorAll('nav a')].map((a) => [
        a.textContent,
        a.getAttribute('href'),
        a.getAttribute('aria-current'),
      ]),
    };
  };

  it('on /statistiques/anglais: the two tabs, Anglais open', () => {
    expect(render('/statistiques/anglais')).toEqual({
      label: 'Mes statistiques',
      tabs: [
        ['Anglais', '/statistiques/anglais', 'page'],
        ['Citations', '/statistiques/citations', null],
      ],
    });
  });

  it('on /statistiques/citations: Citations open', () => {
    expect(render('/statistiques/citations').tabs.map((tab) => tab[2])).toEqual([null, 'page']);
  });

  it('the Settings and the spaces keep their own tabs', () => {
    expect(render('/reglages').label).toBe('Réglages');
    expect(render('/anglais/liste').label).toBe('Espace Anglais');
  });

  it('MEM-123: Apprendre · Réviser, Ma liste, Ajouter une carte, Ajouter une liste', () => {
    const { tabs } = render('/anglais/ajouter-liste');
    expect(tabs).toEqual([
      ['Apprendre · Réviser', '/anglais', null],
      ['Ma liste', '/anglais/liste', null],
      ['Ajouter une carte', '/anglais/ajouter', null],
      ['Ajouter une liste', '/anglais/ajouter-liste', 'page'],
    ]);
  });

  it('MEM-123: « Ajouter une liste » highlighted in every page under it, never « Ajouter une carte »', () => {
    for (const at of [
      '/anglais/ajouter-liste/predefinies',
      '/anglais/ajouter-liste/predefinies/0b6a2c5e',
      '/anglais/ajouter-liste/fichier',
    ]) {
      expect(render(at).tabs.map((tab) => tab[2])).toEqual([null, null, null, 'true']);
    }
    expect(render('/anglais/ajouter').tabs.map((tab) => tab[2])).toEqual([null, null, 'page', null]);
  });

  it('on a phone, « Mes statistiques » next to the logo, as « Réglages »', () => {
    pathname = '/statistiques/citations';
    mount(<HeaderTitle />);
    expect(container.querySelector('h1')?.textContent).toBe('Mes statistiques');
  });
});
