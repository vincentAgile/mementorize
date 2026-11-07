'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { internalLink, report } from '../lib/measure';

/**
 * MEM-137: measures in the browser what Umami can't see by itself
 * (lib/measure.ts): a navigation inside the app, from the click on the link
 * to the new page on screen, and each server action, from its sending to
 * its answer. Production only (the root layout); it never changes anything
 * for the user.
 */
export function PerformanceReporter() {
  const pathname = usePathname();
  const pending = useRef<{ to: string; start: number } | null>(null);

  // The click on a link: the navigation starts.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const to = internalLink(event, location.origin, location.pathname);
      if (to) pending.current = { to, start: performance.now() };
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // The new page is rendered: measured at the next frame, when it is on screen.
  useEffect(() => {
    const navigation = pending.current;
    if (!navigation || navigation.to !== pathname) return;
    pending.current = null;
    requestAnimationFrame(() => report('navigation', pathname, performance.now() - navigation.start));
  }, [pathname]);

  // The server actions: a POST with the header Next-Action.
  useEffect(() => {
    const original = window.fetch;
    const measured: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Next-Action')) return original(input, init);
      const start = performance.now();
      const page = location.pathname;
      try {
        return await original(input, init);
      } finally {
        report('action', page, performance.now() - start);
      }
    };
    window.fetch = measured;
    return () => {
      if (window.fetch === measured) window.fetch = original;
    };
  }, []);

  return null;
}
