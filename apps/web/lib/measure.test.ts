// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bandOf, internalLink, report, routeOf } from './measure';

describe('the measures sent to Umami (MEM-137)', () => {
  afterEach(() => {
    delete (window as { umami?: unknown }).umami;
    document.body.innerHTML = '';
  });

  it('groups the pages whatever their ids', () => {
    expect(routeOf('/anglais/ajouter?x=1#y')).toBe('/anglais/ajouter');
    expect(routeOf('/mind-maps/0f8fad5b-d9cb-469f-a165-70867728950e/edit')).toBe('/mind-maps/:id/edit');
    expect(routeOf('/anglais/liste/12')).toBe('/anglais/liste/:n');
    expect(routeOf('')).toBe('/');
  });

  it('puts a duration in a band', () => {
    expect([120, 300, 999, 1000, 2999, 3000].map(bandOf)).toEqual([
      'moins de 0,3 s',
      '0,3 à 1 s',
      '0,3 à 1 s',
      '1 à 3 s',
      '1 à 3 s',
      'plus de 3 s',
    ]);
  });

  it('knows a click on a link that Next.js turns into a navigation', () => {
    document.body.innerHTML = `
      <a id="in" href="/anglais/ajouter-liste"><span id="inner">Ajouter une liste</span></a>
      <a id="same" href="/anglais/ajouter">Ici</a>
      <a id="out" href="https://example.com/x">Ailleurs</a>
      <a id="blank" href="/anglais" target="_blank">Onglet</a>
      <a id="file" href="/anglais/liste/export" download>Export</a>`;
    const click = (id: string, init: MouseEventInit = {}) => {
      const event = new MouseEvent('click', { bubbles: true, button: 0, ...init });
      Object.defineProperty(event, 'target', { value: document.getElementById(id) });
      return internalLink(event, location.origin, '/anglais/ajouter');
    };
    expect(click('inner')).toBe('/anglais/ajouter-liste');
    expect(click('in', { ctrlKey: true })).toBeNull();
    expect(click('same')).toBeNull();
    expect(click('out')).toBeNull();
    expect(click('blank')).toBeNull();
    expect(click('file')).toBeNull();
  });

  it('sends to Umami when it is there, and never breaks the app otherwise', () => {
    expect(() => report('navigation', '/anglais', 1234.4)).not.toThrow(); // blocked: nothing
    const track = vi.fn();
    (window as { umami?: unknown }).umami = { track };
    report('action', '/review/0f8fad5b-d9cb-469f-a165-70867728950e', 1234.4);
    expect(track).toHaveBeenCalledWith('action', { page: '/review/:id', ms: 1234, band: '1 à 3 s' });
    (window as { umami?: unknown }).umami = {
      track: () => {
        throw new Error('blocked');
      },
    };
    expect(() => report('navigation', '/anglais', 10)).not.toThrow();
  });
});
