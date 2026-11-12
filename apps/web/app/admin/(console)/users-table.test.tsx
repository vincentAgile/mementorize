// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserRow } from '../../../lib/admin-api';

const setChatAiAction = vi.fn();
vi.mock('./actions', () => ({ setChatAiAction }));

const { UsersTable } = await import('./users-table');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counts = { Waiting: 0, ToLearn: 0, Learning: 0, Learned: 0, total: 0 };
const space = {
  Vocabulary: counts,
  Quote: counts,
  MindMap: { total: 0, branchesInReview: 0, branchesLearned: 0 },
  total: 0,
};
const user = (id: string, email: string, chatAiEnabled: boolean, firstName: string | null = null): AdminUserRow => ({
  id,
  email,
  firstName,
  lastName: null,
  createdAt: '2026-11-01T10:00:00Z',
  lastActiveAt: '2026-11-10T10:00:00Z',
  chatAiEnabled,
  counts: space,
});
const USERS = [
  user('u1', 'ada@example.com', false, 'Ada'),
  user('u2', 'bob@example.com', true),
  user('u3', 'cid@example.com', false),
];

let root: Root;
let container: HTMLDivElement;
function mount(props: Partial<Parameters<typeof UsersTable>[0]> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<UsersTable users={USERS} totals={space} now="2026-11-12T10:00:00Z" {...props} />));
}
const switches = () => [...container.querySelectorAll<HTMLButtonElement>('button[role="switch"]')];
const emails = () => [...container.querySelectorAll('tbody .admin-users__email')].map((cell) => cell.textContent);
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
};

beforeEach(() => setChatAiAction.mockReset());
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('The Chat IA of each account (MEM-144)', () => {
  it('a column « Chat IA », a switch per row named for the screen readers, off by default', () => {
    mount();
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent?.replace(/[↕▲▼]/g, ''))).toContain(
      'Chat IA',
    );
    const byLabel = Object.fromEntries(
      switches().map((s) => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')]),
    );
    expect(byLabel).toEqual({
      'Chat IA pour Ada': 'false',
      'Chat IA pour bob@example.com': 'true',
      'Chat IA pour cid@example.com': 'false',
    });
    expect(container.querySelector('tfoot .admin-users__chat')!.textContent).toBe('1 activé');
    expect(container.textContent).not.toContain('Le Chat IA est coupé pour tous');
  });

  it('a click saves at once, says it is saved; no second click while it saves', async () => {
    mount();
    let answer: (value: { ok: boolean }) => void = () => undefined;
    setChatAiAction.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const ada = switches().find((s) => s.getAttribute('aria-label') === 'Chat IA pour Ada')!;
    act(() => ada.click());
    expect(setChatAiAction).toHaveBeenCalledWith('u1', true);
    expect(ada.getAttribute('aria-checked')).toBe('true');
    expect(ada.disabled).toBe(true);
    act(() => ada.click());
    expect(setChatAiAction).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true }));
    await flush();
    expect(ada.disabled).toBe(false);
    expect(container.textContent).toContain('Enregistré ✓');
    expect(container.querySelector('tfoot .admin-users__chat')!.textContent).toBe('2 activés');
  });

  it('a failure says so and puts the previous state back', async () => {
    mount();
    setChatAiAction.mockResolvedValueOnce({ ok: false });
    const bob = switches().find((s) => s.getAttribute('aria-label') === 'Chat IA pour bob@example.com')!;
    act(() => bob.click());
    await flush();
    expect(bob.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Échec de l’enregistrement : réessaie.');
    setChatAiAction.mockRejectedValueOnce(new Error('down'));
    act(() => bob.click());
    await flush();
    expect(bob.getAttribute('aria-checked')).toBe('true');
  });

  it('sorted on the column (granted first), filtered on « Chat IA activé »', async () => {
    mount();
    const header = [...container.querySelectorAll<HTMLButtonElement>('thead button')].find((b) =>
      b.textContent?.startsWith('Chat IA'),
    )!;
    act(() => header.click());
    expect(emails()[0]).toBe('bob@example.com');
    const filter = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.closest('label')?.textContent === 'Chat IA activé',
    )!;
    act(() => filter.click());
    expect(emails()).toEqual(['bob@example.com']);
    expect(container.textContent).toContain('1 sur 3 utilisateurs');
    // Withdrawn: it leaves the filtered list.
    setChatAiAction.mockResolvedValueOnce({ ok: true });
    act(() => switches()[0].click());
    await flush();
    expect(emails()).toEqual([]);
    expect(container.textContent).toContain('Le Chat IA n’est activé pour aucun utilisateur.');
  });

  it('off for everyone: a note above the table, the switches still work', () => {
    mount({ chatOff: true });
    expect(container.textContent).toContain(
      'Le Chat IA est coupé pour tous : les réglages ci-dessous sont sans effet pour le moment.',
    );
    expect(switches().every((s) => !s.disabled)).toBe(true);
  });
});
