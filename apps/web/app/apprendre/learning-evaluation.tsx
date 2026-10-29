'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { formatDelay } from '../../lib/format';
import type { LearningItem } from '../../lib/types';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import type { Answer } from '../review/rating-buttons';
import { type CardFace, ReviewCard } from '../review/review-card';

interface LearningEvaluationProps {
  /** The series, in its order. */
  items: LearningItem[];
  /** The server's clock, so that the server and the browser show the same delays at first. */
  now: string;
  /** The delays under the rating buttons: a setting, off by default (MEM-49). */
  showDelays: boolean;
  /** The pronunciation assessment is configured on the server: offered on the answer, as in the review (MEM-91). */
  canAssess: boolean;
  /**
   * An item is through: its last answer is not « À revoir ». `answers`: all
   * the answers it got, in their order (the « À revoir » before included).
   */
  onItemDone: (item: LearningItem, answers: Answer[]) => void;
  /** Every item is through. */
  onFinished: () => void;
}

const RATINGS = ['Again', 'Hard', 'Good'] as const;

/** The French → English card of an item, as the review shows it (review/page.tsx). */
function facesOf(item: LearningItem, canAssess: boolean): { front: CardFace; back: CardFace } {
  const heading = 'Français → anglais';
  const english = { main: item.word, lang: 'en', speak: true, audioUrl: pronunciationUrl(item.id, item.word) };
  return {
    front: { heading, main: item.translation, lang: 'fr', prompt: 'Comment le dit-on en anglais ?' },
    back: {
      heading,
      ...english,
      ...(canAssess && { assessItemId: item.id }),
      note: item.example,
      frenchNote: item.frenchExample ?? null,
    },
  };
}

/**
 * MEM-103: the step « Évaluation de l'apprentissage », with the mechanics and
 * the components of the review (review-card.tsx): the French → English card
 * of each item, revealed, then self-assessed with the four buttons, the
 * same shortcuts (Space, 1-4) and the same frame « Évaluer ma prononciation ».
 * As in the review (MEM-47), an item rated « À revoir » is put back at the
 * bottom of the pile and comes back in the same series, until it gets
 * another answer. Nothing is sent from here: the session decides when the
 * answers reach the API (send-answers.ts). « Appris » is not a FSRS rating
 * (MEM-46): the item leaves the review, and the API keeps `Learned` for the
 * history, out of the optimisation data.
 */
export function LearningEvaluation({
  items,
  now,
  showDelays,
  canAssess,
  onItemDone,
  onFinished,
}: LearningEvaluationProps) {
  const [pile, setPile] = useState(() => items.map((_, i) => i)); // indexes in `items`, the current one first
  // Incremented after each answer: a fresh (hidden) card, even when the same
  // item is shown again because it is the last one left.
  const [turn, setTurn] = useState(0);
  const [clock, setClock] = useState(now);
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});

  const item = items[pile[0]];

  const answer = useCallback(
    async (choice: Answer) => {
      const current = items[pile[0]];
      const given = [...(answers[current.id] ?? []), choice];
      setAnswers({ ...answers, [current.id]: given });
      const rest = choice === 'Again' ? [...pile.slice(1), pile[0]] : pile.slice(1);
      if (choice !== 'Again') onItemDone(current, given);
      setClock(new Date().toISOString());
      setPile(rest);
      setTurn((n) => n + 1);
      if (rest.length === 0) onFinished();
    },
    [items, pile, answers, onItemDone, onFinished],
  );

  if (!item) return null;

  // Put back after « À revoir »: the delays of its card once rated so.
  const due = answers[item.id]?.length ? item.nextDueAfterAgain : item.nextDue;
  const position = items.length - pile.length; // the items through (« À revoir » does not count)
  const { front, back } = facesOf(item, canAssess);

  return (
    <section className="learning-session" aria-label="Évaluation de l’apprentissage">
      <p className="review-progress">
        <strong>Étape 3 · Évaluation de l’apprentissage</strong> ·{' '}
        <span aria-label={`Élément ${position + 1} sur ${items.length}`}>
          {position + 1} / {items.length}
        </span>{' '}
        · <Link href="/anglais">Arrêter</Link>
      </p>
      <ol className="learning-steps" aria-hidden="true">
        {items.map((it, i) => (
          <li key={it.id} className={i === pile[0] ? 'is-current' : !pile.includes(i) ? 'is-done' : undefined} />
        ))}
      </ol>
      <ReviewCard
        key={turn}
        front={front}
        back={back}
        repeatFront
        withLearned
        delays={
          showDelays
            ? Object.fromEntries(RATINGS.map((rating) => [rating, formatDelay(new Date(clock), new Date(due[rating]))]))
            : undefined
        }
        onAnswer={answer}
      />
    </section>
  );
}
