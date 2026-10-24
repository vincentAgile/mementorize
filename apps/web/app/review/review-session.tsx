'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDelay, NBSP } from '../../lib/format';
import type { ReviewRating } from '../../lib/types';
import { learnedAction, reviewAction } from './actions';
import type { Answer } from './rating-buttons';
import { type CardFace, ReviewCard } from './review-card';

/** A card of the session, its two sides built by the page. */
export interface SessionCard {
  cardId: string;
  front: CardFace;
  back: CardFace;
  repeatFront: boolean;
  /**
   * What « Appris » takes out of the review: the vocabulary item (MEM-22) or
   * the quote (MEM-67), or only this card for a mind map branch (MEM-48).
   */
  learned: { itemId: string } | { cardId: string };
  /** When the card comes back with each rating (ISO dates). */
  nextDue: Record<ReviewRating, string>;
}

interface ReviewSessionProps {
  cards: SessionCard[];
  /** All the due cards, beyond those loaded (the API sends 100 at most). */
  total: number;
  /** The server's clock, so that the server and the browser show the same delays at first. */
  now: string;
  space?: { label: string; href: string };
  /** The delays under the rating buttons: a setting, off by default (MEM-49). */
  showDelays: boolean;
}

const RATINGS = ['Again', 'Hard', 'Good'] as const;

/**
 * A review session (MEM-47): the cards due when it starts, one at a time.
 * A card rated « À revoir » is recorded as such, then put back at the bottom
 * of the pile: it comes back after all the others, whatever its FSRS delay,
 * until it gets another answer. The pile lives here, in the browser: leaving
 * the session and coming back starts a new one, from the FSRS due dates.
 */
export function ReviewSession({ cards, total, now, space, showDelays }: ReviewSessionProps) {
  const router = useRouter();
  const [pile, setPile] = useState(cards);
  // Incremented after each answer: a fresh (hidden) card, even when the same
  // card is shown again because it is the last one left.
  const [turn, setTurn] = useState(0);
  const [clock, setClock] = useState(now);
  const current = pile[0];
  const notLoaded = total - cards.length;

  const answer = useCallback(
    async (choice: Answer) => {
      const card = pile[0];
      let comesBack: Record<ReviewRating, string> | null = null;
      if (choice === 'Learned') {
        await learnedAction(card.learned);
      } else {
        // null: refused (card deleted in another tab): it leaves the pile.
        const next = await reviewAction(card.cardId, choice);
        if (choice === 'Again') comesBack = next;
      }
      setClock(new Date().toISOString());
      setPile(([, ...rest]) => (comesBack ? [...rest, { ...card, nextDue: comesBack }] : rest));
      setTurn((n) => n + 1);
    },
    [pile],
  );

  // End of the pile: the page is rendered again, which brings the counters
  // of the menu up to date and then shows what's left: the next cards when
  // more than 100 were due, "Rien à réviser", or the subject's space.
  useEffect(() => {
    if (!current) router.refresh();
  }, [current, router]);

  if (!current) {
    return <p className="review-progress">Session terminée…</p>;
  }

  const remaining = pile.length + notLoaded;
  return (
    <>
      <p className="review-progress">
        {space && <strong>{space.label} · </strong>}
        {remaining}
        {NBSP}carte{remaining > 1 ? 's' : ''} à réviser
        {space && (
          <>
            {' · '}
            <Link href={space.href}>Arrêter</Link>
          </>
        )}
      </p>
      <ReviewCard
        key={turn}
        front={current.front}
        back={current.back}
        repeatFront={current.repeatFront}
        withLearned
        delays={
          showDelays
            ? Object.fromEntries(
                RATINGS.map((rating) => [rating, formatDelay(new Date(clock), new Date(current.nextDue[rating]))]),
              )
            : undefined
        }
        onAnswer={answer}
      />
    </>
  );
}
