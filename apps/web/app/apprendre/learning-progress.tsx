'use client';

import { useEffect, useState } from 'react';
import { longDay, relativeDay } from '../../lib/progress';
import type { ItemType, LearningProgress as Progress, ListType } from '../../lib/types';
import { progressAction } from './actions';
import { ProgressChart } from './progress-chart';

/**
 * The end of a learning session, in both spaces: when the next review is
 * and how many cards it will have (all those of the space due by the end of
 * that day), then the progress of the space, day by day. Read once the
 * answers of the session are saved; nothing shown if it can't be read.
 */
export function LearningProgress({ type }: { type: ListType }) {
  const [progress, setProgress] = useState<Progress | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    progressAction(type)
      .catch(() => null)
      .then((read) => current && setProgress(read));
    return () => {
      current = false;
    };
  }, [type]);

  if (progress === undefined) {
    return (
      <p className="learning-progress__loading" role="status">
        Chargement de la progression…
      </p>
    );
  }
  if (progress === null) return null;
  return <ProgressSummary progress={progress} type={type} />;
}

/** How a space counts its items, in the chart. */
const NOUNS: Record<ItemType, string> = { Vocabulary: 'éléments', Quote: 'citations', MindMap: 'cartes mentales' };

/**
 * The next review of a space and its progress: at the end of a learning
 * session (read above) and of a review (read by the page, review/page.tsx),
 * and in « Mes statistiques » (MEM-114), with its own title, « Progression ·
 * Anglais », as the section of its page (h2).
 * No chart for the mind maps, always in learning: their days are empty.
 */
export function ProgressSummary({
  progress: { nextReview, days },
  type,
  title = 'Progression',
  level = 3,
}: {
  progress: Progress;
  type: ItemType;
  title?: string;
  level?: 2 | 3;
}) {
  if (!nextReview && days.length === 0) return null; // a space with nothing learned: its title says it all
  const now = new Date();
  const next = (
    <p className="learning-progress__next">
      {nextReview ? (
        <>
          Prochaine révision <strong>{relativeDay(nextReview.day, now)}</strong>
          <span className="learning-progress__date"> ({longDay(nextReview.day)})</span> :{' '}
          <strong>
            {nextReview.count}&nbsp;carte{nextReview.count > 1 ? 's' : ''}
          </strong>{' '}
          à réviser.
        </>
      ) : (
        'Aucune carte à réviser pour le moment.'
      )}
    </p>
  );
  const chart = days.length > 0 && <ProgressChart days={days} noun={NOUNS[type]} />;

  // « Mes statistiques »: the title of the section first, then the next review and the chart.
  if (level === 2) {
    return (
      <section className="learning-progress learning-progress--page" aria-labelledby="progress-title">
        <h2 id="progress-title" className="learning-progress__title">
          {title}
        </h2>
        {next}
        {chart}
      </section>
    );
  }
  // The end of a session, under its « Session terminée »: the next review, then « Progression » and the chart.
  return (
    <section className="learning-progress" aria-label="Progression">
      {next}
      {chart && (
        <>
          <h3 className="learning-progress__title">{title}</h3>
          {chart}
        </>
      )}
    </section>
  );
}
