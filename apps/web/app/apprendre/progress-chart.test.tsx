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
    act(() => createRoot(container).render(<ProgressChart days={days} noun="cartes" />));
    const legend = container.querySelector('figcaption')!.textContent;
    expect(legend).toContain('Appris · 2');
    expect(legend).toContain('En cours d’apprentissage · 5');
  });

  it('MEM-120: the summary for screen readers says « cartes », agreed', () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
    try {
      act(() => createRoot(container).render(<ProgressChart days={days} noun="cartes" />));
      expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(
        /^Progression des cartes : aujourd’hui 2 apprises et 5 en cours d’apprentissage, depuis le /,
      );
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width);
    }
  });
});
