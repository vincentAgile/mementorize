import { redirect } from 'next/navigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearningProgress } from '../../lib/types';

const getLearningProgress = vi.fn();
vi.mock('../../lib/api', () => ({ getLearningProgress }));
vi.mock('../apprendre/actions', () => ({ progressAction: vi.fn() }));
const { SpaceStatistics } = await import('./space-statistics');

const progress: LearningProgress = {
  nextReview: { day: '2026-11-04', count: 12 },
  days: [{ day: '2026-11-03', learning: 5, learned: 2 }],
};
const render = async (type: 'Vocabulary' | 'Quote') => renderToStaticMarkup(await SpaceStatistics({ type }));
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;| /g, ' ');

describe('Mes statistiques: a tab per space (MEM-114)', () => {
  beforeEach(() => {
    getLearningProgress.mockReset();
  });

  it('the vocabulary: its next review and its progress, read for the space', async () => {
    getLearningProgress.mockResolvedValue(progress);
    const html = await render('Vocabulary');
    expect(getLearningProgress).toHaveBeenCalledWith('Vocabulary');
    expect(text(html)).toContain('Progression · Anglais');
    expect(text(html)).toContain('12 cartes à réviser.');
    expect(text(html)).toContain('Appris · 2');
    expect(text(html)).toContain('En cours d’apprentissage · 5');
  });

  it('the quotes, with their own title', async () => {
    getLearningProgress.mockResolvedValue(progress);
    const html = await render('Quote');
    expect(getLearningProgress).toHaveBeenCalledWith('Quote');
    expect(text(html)).toContain('Progression · Citations');
  });

  it('nothing learned yet: the message, and the way to learn in the space', async () => {
    getLearningProgress.mockResolvedValue({ nextReview: null, days: [] });
    const html = await render('Quote');
    expect(text(html)).toContain(
      'Rien à afficher pour le moment : les statistiques apparaissent dès qu’un premier élément est appris.',
    );
    expect(html).toContain('<a href="/citations">Apprendre · Réviser</a>');
    expect(html).not.toContain('learning-progress');
  });

  it('the API in error, or out of reach: the message instead', async () => {
    getLearningProgress.mockImplementation(async () => {
      throw new Error('API error 500');
    });
    expect(text(await render('Vocabulary'))).toContain(
      'Les statistiques ne sont pas disponibles pour le moment. Réessaie dans un instant.',
    );
    getLearningProgress.mockImplementation(async () => {
      throw new TypeError('fetch failed'); // the API out of reach
    });
    expect(text(await render('Vocabulary'))).toContain('ne sont pas disponibles');
  });

  it('the session expired: still to the login page, not caught', async () => {
    getLearningProgress.mockImplementation(async () => redirect('/session-expired'));
    const error = await render('Vocabulary').then(
      () => null,
      (thrown: { digest?: string }) => thrown,
    );
    expect(error?.digest).toContain('NEXT_REDIRECT');
  });
});
