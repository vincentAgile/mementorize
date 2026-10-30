// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListRow } from '../../lib/item-list';
import { RowActions } from './row-actions';

vi.mock('./actions', () => ({
  queueRowAction: vi.fn(),
  relearnAction: vi.fn(),
  resetLearningAction: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  // jsdom has <dialog> without its modal behaviour: enough to open and close it.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (status: ListRow['status']): ListRow => ({
  id: 'item-1',
  status,
  position: status === 'ToLearn' ? 2 : null,
  createdAt: 0,
  nextDue: null,
});

function render(status: ListRow['status'], advanced?: boolean) {
  act(() =>
    root.render(
      <RowActions
        type="Vocabulary"
        row={row(status)}
        name="snag"
        queue
        relearn={{ title: 'Remettre en apprentissage', label: 'Remettre « snag » en apprentissage' }}
        advanced={advanced}
        editTitle="Modifier l’élément"
        editForm={<p>formulaire</p>}
        deleteTitle="Supprimer l’élément ?"
        deletePreview={<p>snag</p>}
        deleteHint="Il disparaît."
        deleteAction={async () => {}}
      />,
    ),
  );
}

const resetButton = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="Réinitialiser l’apprentissage de « snag »"]');

describe('RowActions: « Réinitialiser l’apprentissage » (MEM-111)', () => {
  it('is not there in the Standard mode of use: the row is as before', () => {
    render('Learning');
    expect(resetButton()).toBeNull();
    expect(container.textContent).not.toContain('Réinitialiser');
    expect(container.querySelectorAll('dialog')).toHaveLength(2); // modify, delete
  });

  it('is there in the Advanced mode, whatever the state of the item', () => {
    for (const status of ['Waiting', 'ToLearn', 'Learning', 'Learned'] as const) {
      render(status, true);
      expect(resetButton(), status).not.toBeNull();
      expect(resetButton()!.title).toBe('Réinitialiser l’apprentissage');
    }
  });

  it('asks for a confirmation before acting, with « Réinitialiser » and « Annuler »', () => {
    render('Learned', true);
    const dialog = container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="reset-item-1"]')!;
    expect(dialog.open).toBe(false);
    act(() => resetButton()!.click());
    expect(dialog.open).toBe(true);
    const text = dialog.textContent!.replace(/\u00a0/g, ' '); // the non-breaking spaces of the French quotes
    expect(text).toContain('Réinitialiser l’apprentissage de « snag » ?');
    expect(text).toContain(
      'L’élément repasse en « À apprendre » et ses cartes repartent de zéro. L’historique de révisions est conservé.',
    );
    const buttons = [...dialog.querySelectorAll('button')].map((button) => [button.type, button.textContent]);
    expect(buttons).toEqual([
      ['button', 'Annuler'],
      ['submit', 'Réinitialiser'],
    ]);
    act(() => (dialog.querySelector('button[type="button"]') as HTMLButtonElement).click());
    expect(dialog.open).toBe(false);
  });
});
