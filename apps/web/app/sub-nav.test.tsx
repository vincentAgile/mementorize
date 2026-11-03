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

  it('MEM-118: « Listes prédéfinies » between « Ajouter » and « Import / export », highlighted in a list', () => {
    const { tabs } = render('/anglais/listes-predefinies');
    expect(tabs.map((tab) => tab[0])).toEqual([
      'Apprendre · Réviser',
      'Liste',
      'Ajouter',
      'Listes prédéfinies',
      'Import / export',
    ]);
    expect(tabs[3]).toEqual(['Listes prédéfinies', '/anglais/listes-predefinies', 'page']);
    const inList = render('/anglais/listes-predefinies/0b6a2c5e').tabs;
    expect(inList.map((tab) => tab[2])).toEqual([null, null, null, 'true', null]);
  });

  it('on a phone, « Mes statistiques » next to the logo, as « Réglages »', () => {
    pathname = '/statistiques/citations';
    mount(<HeaderTitle />);
    expect(container.querySelector('h1')?.textContent).toBe('Mes statistiques');
  });
});
