// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveUsageModeAction } from './actions';
import { UsageModeForm } from './usage-mode-form';

vi.mock('./actions', () => ({ saveUsageModeAction: vi.fn(async () => ({ ok: true })) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(saveUsageModeAction).mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const select = () => container.querySelector<HTMLSelectElement>('select[name="usageMode"]')!;

describe('UsageModeForm (MEM-110)', () => {
  it('shows the mode of the account, Standard preselected, with its explanation', () => {
    act(() => root.render(<UsageModeForm usageMode="Standard" />));
    expect(select().value).toBe('Standard');
    expect([...select().options].map((option) => [option.value, option.textContent])).toEqual([
      ['Standard', 'Standard'],
      ['Advanced', 'Avancé'],
    ]);
    expect(container.textContent).toContain(
      'Le mode Avancé ajoute des actions qui modifient l’apprentissage, comme la réinitialisation d’un élément.',
    );
    expect(saveUsageModeAction).not.toHaveBeenCalled();
  });

  it('saves the choice at once, without a button, and says so', async () => {
    act(() => root.render(<UsageModeForm usageMode="Standard" />));
    expect(container.querySelector('button')).toBeNull();
    await act(async () => {
      select().value = 'Advanced';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(saveUsageModeAction).toHaveBeenCalledWith('Advanced');
    expect(select().value).toBe('Advanced');
    expect(container.textContent).toContain('Enregistré ✓');
  });

  it('starts from Avancé for an account already in that mode', () => {
    act(() => root.render(<UsageModeForm usageMode="Advanced" />));
    expect(select().value).toBe('Advanced');
  });
});
