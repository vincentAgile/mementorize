'use client';

import { useEffect, useState } from 'react';
import { longDay, relativeDay } from '../../lib/progress';
import type { LearningProgress as Progress, ListType } from '../../lib/types';
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

  const { nextReview, days } = progress;
  const now = new Date();
  return (
    <section className="learning-progress" aria-label="Progression">
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
      {days.length > 0 && (
        <>
          <h3 className="learning-progress__title">Progression</h3>
          <ProgressChart days={days} noun={type === 'Quote' ? 'citations' : 'éléments'} />
        </>
      )}
    </section>
  );
}
