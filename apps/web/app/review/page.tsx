import Link from 'next/link';
import { getCurrentUser, getDueReviews } from '../../lib/api';
import { firstWords, formatDelay } from '../../lib/format';
import type { ReviewRating } from '../../lib/types';
import { AppHeader } from '../app-header';
import { type RatingOption, ReviewCard } from './review-card';

const LABELS: Record<ReviewRating, string> = {
  Again: 'À revoir',
  Hard: 'Difficile',
  Good: 'Correct',
  Easy: 'Facile',
};

// "À réviser aujourd'hui": one card at a time. After each answer, the
// Server Action revalidates this page, which then shows the next due card.
export default async function ReviewPage() {
  const [user, due] = await Promise.all([getCurrentUser(), getDueReviews(1)]);
  const item = due.items[0];
  const now = new Date();

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />

      {!item ? (
        <section className="review-empty">
          <h2>Rien à réviser pour le moment</h2>
          <p>
            {due.nextDueAt
              ? `Prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}.`
              : "Les citations reviennent ici quand c'est le bon moment pour les revoir."}{' '}
            <Link href="/">Voir mes citations</Link>
          </p>
        </section>
      ) : (
        <>
          <p className="review-progress">
            {due.total} citation{due.total > 1 ? 's' : ''} à réviser
          </p>
          <ReviewCard
            key={`${item.quote.id}-${item.card.due}`} // fresh (hidden) card after each answer
            quoteId={item.quote.id}
            author={item.quote.author}
            source={item.quote.source}
            cue={firstWords(item.quote.text)}
            text={item.quote.text}
            options={(Object.keys(LABELS) as ReviewRating[]).map(
              (rating): RatingOption => ({
                rating,
                label: LABELS[rating],
                delay: formatDelay(now, new Date(item.nextDue[rating])),
              }),
            )}
          />
        </>
      )}
    </main>
  );
}
