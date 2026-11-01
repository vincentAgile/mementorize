// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProgressChart } from './progress-chart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ProgressChart', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => container.remove());

  const days = [
    { day: '2026-10-30', learning: 3, learned: 0 },
    { day: '2026-10-31', learning: 4, learned: 1 },
    { day: '2026-11-01', learning: 5, learned: 2 },
  ];

  it('names each series with its value of today: the colour is never alone', () => {
    act(() => createRoot(container).render(<ProgressChart days={days} noun="éléments" />));
    const legend = container.querySelector('figcaption')!.textContent;
    expect(legend).toContain('Appris · 2');
    expect(legend).toContain('En cours d’apprentissage · 5');
  });

  it('gives the whole series as a table, today first', () => {
    act(() => createRoot(container).render(<ProgressChart days={days} noun="éléments" />));
    const rows = [...container.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['dimanche 1er novembre', '2', '5'],
      ['samedi 31 octobre', '1', '4'],
      ['vendredi 30 octobre', '0', '3'],
    ]);
  });
});
