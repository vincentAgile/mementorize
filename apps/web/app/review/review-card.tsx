'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { pronounce, stopPronouncing } from '../../lib/speech';
import type { ReviewRating } from '../../lib/types';
import { Speakable } from '../speech/speak-button';
import { learnedAction, reviewAction } from './actions';

export interface RatingOption {
  rating: ReviewRating;
  label: string; // "Correct"
  delay: string; // "10 min": when the card comes back with this answer
}

/** One side of a card: built by the page, depending on the card's kind. */
export interface CardFace {
  heading: string; // "Socrates", "Anglais → français"
  subheading?: string | null; // source of a quote
  main: string; // the cue (front) or the answer (back)
  figure?: ReactNode; // shown instead of `main` (mind maps), rendered by the page
  lang?: string; // lang attribute of `main`, for screen readers and hyphenation
  note?: string | null; // back only: example sentence
  prompt?: string; // front only: what to do
  speak?: boolean; // `main` is English vocabulary: a loudspeaker button next to it (MEM-37)
}

interface ReviewCardProps {
  cardId: string;
  front: CardFace;
  back: CardFace;
  /** Keep the question visible above the answer (vocabulary: word -> translation). */
  repeatFront?: boolean;
  options: RatingOption[];
  /** Vocabulary only (MEM-22): the item behind the card, for a fifth button "Appris". */
  learnedItemId?: string;
}

export function ReviewCard({ cardId, front, back, repeatFront = false, options, learnedItemId }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Set as soon as an answer is sent. `disabled={pending}` isn't enough on
  // its own: two clicks or key presses within the same frame both get
  // through before React re-renders, and the card would be rated twice.
  // The component is remounted for the next card (see `key` in page.tsx),
  // which resets it.
  const answered = useRef(false);

  function answer(rating: ReviewRating) {
    return async () => {
      if (answered.current) return;
      answered.current = true;
      await reviewAction(cardId, rating);
    };
  }

  // A new card mounts a new component: the reading of the previous one stops (MEM-37).
  useEffect(() => stopPronouncing, []);

  // MEM-38: when the answer is English (French → English), it is read as it
  // appears. Called in the click or key handler: browsers only allow speech
  // started by the user. Without speech synthesis, nothing is said.
  const reveal = useCallback(() => {
    setRevealed(true);
    if (back.speak) pronounce(back.main);
  }, [back.speak, back.main]);

  async function markLearned() {
    if (answered.current || !learnedItemId) return;
    answered.current = true;
    await learnedAction(learnedItemId);
  }

  // Keyboard shortcuts: space reveals the answer, 1-4 pick a rating, 5 "Appris" (vocabulary).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Held key (auto-repeat) or browser shortcut such as Ctrl+1: ignored.
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        // A focused button (the loudspeaker, MEM-37) handles Enter/Space itself.
        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
        event.preventDefault();
        reveal();
      } else if (revealed && ['1', '2', '3', '4', '5'].includes(event.key)) {
        buttons.current[Number(event.key) - 1]?.click();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, reveal]);

  const face = revealed ? back : front;

  return (
    <article className="review-card">
      <p className="review-card__author">
        {face.heading}
        {face.subheading && <span className="review-card__source"> · {face.subheading}</span>}
      </p>

      {revealed ? (
        <>
          {repeatFront && (
            <Line face={front}>
              <p className="review-card__recall" lang={front.lang}>
                {front.main}
              </p>
            </Line>
          )}
          {back.figure ?? (
            <Line face={back}>
              <blockquote className="review-card__text" lang={back.lang}>
                {back.main}
              </blockquote>
            </Line>
          )}
          {back.note && (
            <p className="review-card__note" lang="en">
              {back.note}
            </p>
          )}
          <p className="review-card__question">Tu t&apos;en souvenais bien ?</p>
          <form className={`review-card__ratings${learnedItemId ? ' review-card__ratings--five' : ''}`}>
            {options.map((option, index) => (
              <RatingButton
                key={option.rating}
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                option={option}
                shortcut={index + 1}
                action={answer(option.rating)}
              />
            ))}
            {learnedItemId && (
              <LearnedButton
                ref={(el) => {
                  buttons.current[4] = el;
                }}
                action={markLearned}
              />
            )}
          </form>
        </>
      ) : (
        <>
          {front.figure ?? (
            <Line face={front}>
              <blockquote className="review-card__text review-card__text--cue" lang={front.lang}>
                {front.main}
              </blockquote>
            </Line>
          )}
          <p className="review-card__question">{front.prompt}</p>
          <button type="button" className="review-card__reveal" onClick={reveal}>
            Afficher la réponse <kbd>Espace</kbd>
          </button>
        </>
      )}
    </article>
  );
}

interface RatingButtonProps {
  option: RatingOption;
  shortcut: number;
  action: () => Promise<void>;
  ref: (el: HTMLButtonElement | null) => void;
}

function RatingButton({ option, shortcut, action, ref }: RatingButtonProps) {
  // useFormStatus reads the state of the parent <form>: all four buttons
  // are disabled while one answer is being sent.
  const { pending } = useFormStatus();
  return (
    <button
      ref={ref}
      type="submit"
      formAction={action}
      disabled={pending}
      className={`rating rating--${option.rating.toLowerCase()}`}
    >
      <span className="rating__label">{option.label}</span>
      <span className="rating__delay">{option.delay}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

/** "Appris" (MEM-22): not a rating, the item leaves the review for good (until put back). */
function LearnedButton({ action, ref }: { action: () => Promise<void>; ref: (el: HTMLButtonElement | null) => void }) {
  const { pending } = useFormStatus();
  return (
    <button ref={ref} type="submit" formAction={action} disabled={pending} className="rating rating--learned">
      <span className="rating__label">Appris</span>
      <span className="rating__delay">ne plus réviser</span>
      <kbd>5</kbd>
    </button>
  );
}

/** The text of a face, with the loudspeaker button when it is English vocabulary (MEM-37). */
function Line({ face, children }: { face: CardFace; children: ReactNode }) {
  return face.speak ? <Speakable text={face.main}>{children}</Speakable> : children;
}
