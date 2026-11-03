import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/admin';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const { AdminNav } = await import('./admin-nav');

const links = (at: string) => {
  pathname = at;
  return [...renderToStaticMarkup(<AdminNav />).matchAll(/<a([^>]*)>([^<]*)<\/a>/g)].map((match) => [
    match[2],
    match[1].match(/aria-current="(\w+)"/)?.[1] ?? null,
  ]);
};

describe('AdminNav (MEM-116)', () => {
  it('« Catalogue » between « Utilisateurs » and « Paramètres »', () => {
    expect(links('/admin').map(([label]) => label)).toEqual(['Utilisateurs', 'Catalogue', 'Paramètres']);
  });

  it('the catalogue and its lists highlight « Catalogue » only', () => {
    expect(links('/admin/catalogue')).toEqual([
      ['Utilisateurs', null],
      ['Catalogue', 'page'],
      ['Paramètres', null],
    ]);
    expect(links('/admin/catalogue/abc')).toEqual([
      ['Utilisateurs', null],
      ['Catalogue', 'true'],
      ['Paramètres', null],
    ]);
  });
});
