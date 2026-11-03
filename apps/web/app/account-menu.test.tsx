// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./(auth)/actions', () => ({ logoutAction: vi.fn() }));
const { AccountMenu } = await import('./account-menu');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AccountMenu: « Mes statistiques » (MEM-113)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<AccountMenu profile={{ email: 'moi@example.com', firstName: 'Vincent', lastName: 'C' }} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const avatar = () => container.querySelector<HTMLButtonElement>('button.avatar')!;
  const entries = () => [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const key = (key: string) =>
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

  it('between « Profil » and the separator, with its icon, to /statistiques', () => {
    act(() => avatar().click());
    expect(entries().map((entry) => entry.textContent)).toEqual(['Profil', 'Mes statistiques', 'Déconnexion']);
    const statistics = entries()[1];
    expect(statistics.getAttribute('href')).toBe('/statistiques');
    expect(statistics.querySelector('svg')).not.toBeNull();
    expect(statistics.nextElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('as the other entries with the keyboard: arrows, Home, End, Escape', () => {
    act(() => avatar().click());
    expect(document.activeElement?.textContent).toBe('Profil');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Mes statistiques');
    key('End');
    expect(document.activeElement?.textContent).toBe('Déconnexion');
    key('ArrowUp');
    expect(document.activeElement?.textContent).toBe('Mes statistiques');
    key('Home');
    expect(document.activeElement?.textContent).toBe('Profil');
    key('Escape');
    expect(entries()).toHaveLength(0);
    expect(document.activeElement).toBe(avatar());
  });

  it('closes the popup when chosen', () => {
    // jsdom can't follow a link: the click is only seen by the menu.
    container.addEventListener('click', (event) => event.preventDefault());
    act(() => avatar().click());
    act(() => entries()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(entries()).toHaveLength(0);
  });
});
