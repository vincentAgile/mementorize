import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceOf } from '../../../lib/spaces';

const getPreferences = vi.fn();
const pronunciationAssessmentEnabled = vi.fn();
const getItems = vi.fn();
const getDueReviews = vi.fn();
vi.mock('../../../lib/api', () => ({ getPreferences, pronunciationAssessmentEnabled, getItems, getDueReviews }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`);
});
vi.mock('next/navigation', () => ({ redirect }));

const { default: LearningIntroPage } = await import('./page');
const { LearnReview } = await import('../../spaces/learn-review');

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();

describe('The explanation of the steps, in the Guided mode (MEM-127)', () => {
  beforeEach(() => {
    redirect.mockClear();
    pronunciationAssessmentEnabled.mockResolvedValue(true);
  });

  it('the four steps, numbered as the headings of the session, the selection before; « Commencer » and « Retour »', async () => {
    getPreferences.mockResolvedValue({ learningMode: 'Guided' });
    const html = renderToStaticMarkup(await LearningIntroPage());
    expect(text(html)).toContain('Comment se passe l’apprentissage ?');
    const steps = [...html.matchAll(/<li class="learning-intro__step">(.*?)<\/li>/g)].map((m) => text(m[1]));
    expect(steps).toEqual([
      'Avant de commencer Sélectionner les cartes à apprendre Choisis jusqu’à 10 cartes dans ta file.',
      'Étape 1 Écouter et prononcer Écoute chaque mot anglais, répète-le et évalue ta prononciation. Étape 1 · Écoute et prononciation',
      'Étape 2 Restituer en français Tu vois le mot anglais : retrouve sa traduction, puis vérifie. Étape 2 · Anglais → français',
      'Étape 3 Restituer en anglais Tu vois le français : retrouve le mot anglais, puis note ta réponse. Étape 3 · Évaluation de l’apprentissage',
    ]);
    expect(html).toMatch(/<a class="space__review learning-intro__start" href="\/anglais\/preparer">Commencer<\/a>/);
    expect(html).toContain('<a class="learning-intro__back" href="/anglais">Retour</a>');
    expect(html).toContain('<ol class="learning-intro__steps">');
  });

  it('without the pronunciation assessment, step 1 doesn’t promise it', async () => {
    getPreferences.mockResolvedValue({ learningMode: 'Guided' });
    pronunciationAssessmentEnabled.mockResolvedValue(false);
    const html = renderToStaticMarkup(await LearningIntroPage());
    expect(text(html)).toContain('Écoute chaque mot anglais et répète-le.');
    expect(html).not.toContain('évalue ta prononciation');
  });

  it('Guided while the API doesn’t send the mode yet; Autonomous: to the preparation, on the server', async () => {
    getPreferences.mockResolvedValue({});
    await expect(LearningIntroPage()).resolves.toBeTruthy();
    getPreferences.mockResolvedValue({ learningMode: 'Autonomous' });
    await expect(LearningIntroPage()).rejects.toThrow('NEXT_REDIRECT /anglais/preparer');
  });
});

describe('Where « Apprendre » goes (MEM-127)', () => {
  const item = { learningStatus: 'ToLearn' };
  beforeEach(() => {
    getItems.mockResolvedValue([item, item]);
    getDueReviews.mockResolvedValue({ total: 0, nextDue: null, items: [] });
  });
  const learnLink = async (type: 'Vocabulary' | 'Quote') => {
    const html = renderToStaticMarkup(await LearnReview({ space: spaceOf(type) }));
    return html.match(/<a class="space__review space__review--learn" href="([^"]+)">/)![1];
  };

  it('Anglais: the explanation in the Guided mode, the preparation in the Autonomous one', async () => {
    getPreferences.mockResolvedValue({ learningMode: 'Guided' });
    expect(await learnLink('Vocabulary')).toBe('/anglais/apprendre');
    getPreferences.mockResolvedValue({ learningMode: 'Autonomous' });
    expect(await learnLink('Vocabulary')).toBe('/anglais/preparer');
  });

  it('Citations: unchanged, whatever the mode', async () => {
    getPreferences.mockResolvedValue({ learningMode: 'Guided' });
    expect(await learnLink('Quote')).toBe('/citations/preparer');
  });

  it('« Apprendre les suivants », at the end of a session, goes straight to the preparation', () => {
    const session = readFileSync(new URL('../../apprendre/learning-session.tsx', import.meta.url), 'utf8');
    expect(session).toMatch(/<a href="\/anglais\/preparer" className="learning-done__next">/);
  });
});
