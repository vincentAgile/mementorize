import Link from 'next/link';
import { getCurrentUser, getDueReviews } from '../../lib/api';
import { firstWords, formatDelay } from '../../lib/format';
import type { DueItem, ReviewRating } from '../../lib/types';
import { AppHeader } from '../app-header';
import { type CardFace, type RatingOption, ReviewCard } from './review-card';

const LABELS: Record<ReviewRating, string> = {
  Again: 'À revoir',
  Hard: 'Difficile',
  Good: 'Correct',
  Easy: 'Facile',
};

/**
 * What each side of a card shows, depending on its kind. This is the only
 * place in the web app that knows how to turn an item into a question.
 */
function facesOf({ item, card }: DueItem): { front: CardFace; back: CardFace; repeatFront: boolean } {
  if (item.type === 'Quote') {
    const heading = item.content.author ?? 'Auteur inconnu';
    const subheading = item.content.source;
    return {
      front: { heading, subheading, main: firstWords(item.content.text), prompt: 'Récite la suite de tête, puis vérifie.' },
      back: { heading, subheading, main: item.content.text },
      repeatFront: false,
    };
  }

  const { word, translation, example } = item.content;
  const english = { main: word, lang: 'en' };
  const french = { main: translation, lang: 'fr' };

  return card.kind === 'EnglishToFrench'
    ? {
        front: { heading: 'Anglais → français', ...english, prompt: 'Quelle est la traduction ?' },
        back: { heading: 'Anglais → français', ...french, note: example },
        repeatFront: true,
      }
    : {
        front: { heading: 'Français → anglais', ...french, prompt: 'Comment le dit-on en anglais ?' },
        back: { heading: 'Français → anglais', ...english, note: example },
        repeatFront: true,
      };
}

// "À réviser aujourd'hui": one card at a time. After each answer, the
// Server Action revalidates this page, which then shows the next due card.
export default async function ReviewPage() {
  const [user, due] = await Promise.all([getCurrentUser(), getDueReviews(1)]);
  const next = due.items[0];
  const now = new Date();

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />

      {!next ? (
        <section className="review-empty">
          <h2>Rien à réviser pour le moment</h2>
          <p>
            {due.nextDueAt
              ? `Prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}.`
              : "Les fiches reviennent ici quand c'est le bon moment pour les revoir."}{' '}
            <Link href="/">Voir mes fiches</Link>
          </p>
        </section>
      ) : (
        <>
          <p className="review-progress">
            {due.total} carte{due.total > 1 ? 's' : ''} à réviser
          </p>
          <ReviewCard
            key={`${next.card.id}-${next.card.due}`} // fresh (hidden) card after each answer
            cardId={next.card.id}
            {...facesOf(next)}
            options={(Object.keys(LABELS) as ReviewRating[]).map(
              (rating): RatingOption => ({
                rating,
                label: LABELS[rating],
                delay: formatDelay(now, new Date(next.nextDue[rating])),
              }),
            )}
          />
        </>
      )}
    </main>
  );
}
