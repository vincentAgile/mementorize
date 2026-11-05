import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDueReviews, getLearningProgress, getPreferences, pronunciationAssessmentEnabled } from '../../lib/api';
import { findSpace } from '../../lib/spaces';
import { ProgressSummary } from '../apprendre/learning-progress';
import { AppHeader } from '../app-header';
import { learningModeOf } from '../../lib/types';
import { facesOf } from './faces';
import { ReviewSession, type SessionCard } from './review-session';

// The review of a subject space, ?type=… (MEM-4): a session over its cards
// due now (MEM-47), one at a time, its pile kept in the browser
// (review-session.tsx). « Tout réviser », all the spaces at once, is gone:
// without a space, the home space.
// MEM-28: « Réviser · Anglais · Mementorize ».
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
  const space = findSpace((await searchParams).type);
  return { title: space ? `Réviser · ${space.label}` : 'Réviser' };
}

/** The most cards loaded at once (the API's limit); the rest at the end of the session. */
const SESSION_LIMIT = 100;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ type?: string; fin?: string }> }) {
  const params = await searchParams;
  const space = findSpace(params.type);
  if (!space) redirect('/'); // « Tout réviser » no more: the home space
  const [due, preferences, canAssess] = await Promise.all([
    getDueReviews(SESSION_LIMIT, space.type),
    getPreferences(),
    pronunciationAssessmentEnabled(),
  ]);
  const now = new Date();

  // Nothing (left) to review in a subject: when its next review is, and its
  // progress, as at the end of a learning session. « Révision terminée »
  // when the session just ended (?fin=1, review-session.tsx).
  if (due.items.length === 0) {
    const progress = await getLearningProgress(space.type).catch(() => null);
    return (
      <>
        <AppHeader />
        <main className="page page--reading">
          <h1 className="visually-hidden page__sr-title">{`Réviser · ${space.label}`}</h1>
          <section className="learning-done">
            <h2>{params.fin ? 'Révision terminée' : `Rien à réviser pour le moment${'\u202f'}!`}</h2>
            {progress && <ProgressSummary progress={progress} type={space.type} />}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">{`Réviser · ${space.label}`}</h1>
        <ReviewSession
          // A new session each time the page is rendered (the end of the
          // previous one refreshes it): its pile starts from the props.
          key={randomUUID()}
          cards={due.items.map((next): SessionCard => ({
            cardId: next.card.id,
            ...facesOf(next, canAssess, learningModeOf(preferences) === 'Guided'),
            // Learned per item, except a mind map: per branch (MEM-48, MEM-67).
            learned: next.item.type === 'MindMap' ? { cardId: next.card.id } : { itemId: next.item.id },
            nextDue: next.nextDue,
          }))}
          total={due.total}
          showDelays={preferences.showReviewDelays}
          now={now.toISOString()}
          space={{ type: space.type, label: space.label, href: space.href }}
        />
      </main>
    </>
  );
}
