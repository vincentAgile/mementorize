import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parisDay } from '../../lib/progress';
import type { LearningProgress } from '../../lib/types';

vi.mock('./actions', () => ({ progressAction: vi.fn() }));
const { ProgressSummary } = await import('./learning-progress');

const progress: LearningProgress = {
  nextReview: { day: parisDay(new Date()), count: 12 },
  days: [
    { day: '2026-11-01', learning: 3, learned: 1 },
    { day: '2026-11-02', learning: 4, learned: 2 },
  ],
};
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;| /g, ' ');

describe('ProgressSummary', () => {
  it('the end of a session, unchanged: the next review, then « Progression » (h3) and the chart', () => {
    const html = renderToStaticMarkup(<ProgressSummary progress={progress} type="Vocabulary" />);
    expect(html).toMatch(
      /^<section class="learning-progress" aria-label="Progression"><p class="learning-progress__next">/,
    );
    expect(text(html)).toContain('Prochaine révision aujourd’hui');
    expect(text(html)).toContain('12 cartes à réviser.');
    expect(html).toContain('<h3 class="learning-progress__title">Progression</h3>');
    expect(html.indexOf('learning-progress__next')).toBeLessThan(html.indexOf('<h3'));
    expect(html).not.toContain('<h2');
    expect(text(html)).toContain('Appris · 2');
  });

  it('« Mes statistiques » (MEM-114): its title first, as the section of the page (h2)', () => {
    const html = renderToStaticMarkup(
      <ProgressSummary progress={progress} type="Quote" title="Progression · Citations" level={2} />,
    );
    expect(html).toMatch(
      /^<section class="learning-progress learning-progress--page" aria-labelledby="progress-title"><h2 id="progress-title"/,
    );
    expect(text(html)).toContain('Progression · Citations');
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('learning-progress__next'));
    expect(html).not.toContain('<h3');
  });

  it('nothing learned and nothing to review: nothing', () => {
    expect(renderToStaticMarkup(<ProgressSummary progress={{ nextReview: null, days: [] }} type="Vocabulary" />)).toBe(
      '',
    );
  });
});
