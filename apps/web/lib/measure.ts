/**
 * MEM-137: what Umami can't see by itself, measured in the browser and sent
 * to it as events. Umami's « Performance » tab measures the full loads of a
 * page (TTFB, FCP, LCP) and the clicks that freeze the page (INP); it sees
 * nothing of a navigation inside the app (Next.js, without reloading) nor of
 * a server action (a rating in a review), which wait for the network with
 * the page still. Here: the time between the click on a link and the new
 * page on screen (« navigation »), and the time of a server action
 * (« action »). Nothing is sent without Umami (blocked, not configured).
 */

/** The address of the tracker loader (app/suivi.js/route.ts), production only. */
export const LOADER_HREF = '/suivi.js';

/** The ids in an address are replaced: the measures of a page are grouped, whatever the card. */
export function routeOf(path: string): string {
  return (
    path
      .split('?')[0]
      .split('#')[0]
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:n') || '/'
  );
}

/** A duration in a few bands, readable in Umami's event properties. */
export function bandOf(ms: number): string {
  if (ms < 300) return 'moins de 0,3 s';
  if (ms < 1000) return '0,3 à 1 s';
  if (ms < 3000) return '1 à 3 s';
  return 'plus de 3 s';
}

/** The link of a click that Next.js turns into a navigation inside the app, if it is one. */
export function internalLink(event: MouseEvent, origin: string, current: string): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname === current) return null;
  return url.pathname;
}

export interface UmamiEvent {
  /** The page measured (ids replaced). */
  page: string;
  ms: number;
  band: string;
}

/** Sends a measure to Umami, if it is there: blocked or not loaded, nothing happens. */
export function report(name: 'navigation' | 'action', page: string, ms: number): void {
  const umami = (window as { umami?: { track: (name: string, data: UmamiEvent) => unknown } }).umami;
  if (typeof umami?.track !== 'function') return;
  const rounded = Math.round(ms);
  try {
    void Promise.resolve(umami.track(name, { page: routeOf(page), ms: rounded, band: bandOf(rounded) })).catch(
      () => undefined,
    );
  } catch {
    // A tracker that fails never stops the app.
  }
}
