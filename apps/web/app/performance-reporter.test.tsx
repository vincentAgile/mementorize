// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/anglais/ajouter';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const { PerformanceReporter } = await import('./performance-reporter');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PerformanceReporter (MEM-137)', () => {
  let root: Root;
  const track = vi.fn();
  const network = vi.fn(async () => new Response('ok'));

  beforeEach(() => {
    pathname = '/anglais/ajouter';
    window.history.replaceState(null, '', '/anglais/ajouter');
    track.mockClear();
    (window as { umami?: unknown }).umami = { track };
    window.fetch = network as typeof fetch;
    document.body.innerHTML = '<a id="link" href="/anglais/ajouter-liste">Ajouter une liste</a><div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    act(() => root.render(<PerformanceReporter />));
  });
  afterEach(() => {
    act(() => root.unmount());
    delete (window as { umami?: unknown }).umami;
  });

  it('measures a navigation inside the app, from the click to the new page', async () => {
    document.getElementById('link')!.addEventListener('click', (event) => event.preventDefault());
    act(() => document.getElementById('link')!.click());
    await new Promise((resolve) => setTimeout(resolve, 30));
    pathname = '/anglais/ajouter-liste';
    act(() => root.render(<PerformanceReporter />));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(track).toHaveBeenCalledTimes(1);
    const [name, data] = track.mock.calls[0];
    expect(name).toBe('navigation');
    expect(data).toMatchObject({ page: '/anglais/ajouter-liste' });
    expect(data.ms).toBeGreaterThanOrEqual(25);
  });

  it('measures each server action, and only them', async () => {
    await window.fetch('/anglais', { method: 'POST', headers: { 'Next-Action': 'abc' } });
    expect(track).toHaveBeenCalledWith('action', expect.objectContaining({ page: '/anglais/ajouter' }));
    track.mockClear();
    await window.fetch('/anglais/chat/voix', { method: 'POST' });
    expect(track).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('gives fetch back when it leaves', () => {
    expect(window.fetch).not.toBe(network);
    act(() => root.unmount());
    expect(window.fetch).toBe(network);
    root = createRoot(document.getElementById('root')!); // for afterEach
  });
});
