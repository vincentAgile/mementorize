// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLearningModeAction } from './actions';
import { learningModeOf } from '../../lib/types';
import { LearningModeForm } from './learning-mode-form';

vi.mock('./actions', () => ({ saveLearningModeAction: vi.fn(async () => ({ ok: true })) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(saveLearningModeAction).mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const select = () => container.querySelector<HTMLSelectElement>('select[name="learningMode"]')!;

describe('LearningModeForm (MEM-125)', () => {
  it('shows the mode of the account, Guidé preselected, with its explanation', () => {
    act(() => root.render(<LearningModeForm learningMode="Guided" />));
    expect(container.querySelector('h2')!.textContent).toBe('Mode d’apprentissage');
    expect(select().value).toBe('Guided');
    expect(container.querySelector('label')!.textContent).toContain('Mode d’apprentissage');
    expect([...select().options].map((option) => [option.value, option.textContent])).toEqual([
      ['Guided', 'Guidé'],
      ['Autonomous', 'Autonome'],
    ]);
    expect(container.textContent).toContain(
      'Guidé explique chaque étape de l’apprentissage et pose la question ; Autonome va droit au but.',
    );
    expect(saveLearningModeAction).not.toHaveBeenCalled();
  });

  it('saves the choice at once, without a button, and says so', async () => {
    act(() => root.render(<LearningModeForm learningMode="Guided" />));
    expect(container.querySelector('button')).toBeNull();
    await act(async () => {
      select().value = 'Autonomous';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(saveLearningModeAction).toHaveBeenCalledWith('Autonomous');
    expect(select().value).toBe('Autonomous');
    expect(container.textContent).toContain('Enregistré ✓');
  });

  it('starts from Autonome for an account already in that mode', () => {
    act(() => root.render(<LearningModeForm learningMode="Autonomous" />));
    expect(select().value).toBe('Autonomous');
  });

  it('Guidé while the API doesn’t send the mode yet (a deployment)', () => {
    expect(learningModeOf({})).toBe('Guided');
    expect(learningModeOf({ learningMode: 'Autonomous' })).toBe('Autonomous');
  });
});
