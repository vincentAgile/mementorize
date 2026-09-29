'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReviewRating } from '../../lib/types';
import { reviewAction } from './actions';

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
  lang?: string; // lang attribute of `main`, for screen readers and hyphenation
  note?: string | null; // back only: example sentence
  prompt?: string; // front only: what to do
}

interface ReviewCardProps {
  cardId: string;
  front: CardFace;
  back: CardFace;
  /** Keep the question visible above the answer (vocabulary: word -> translation). */
  repeatFront?: boolean;
  options: RatingOption[];
}

export function ReviewCard({ cardId, front, back, repeatFront = false, options }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // Keyboard shortcuts: space reveals the answer, 1-4 pick a rating.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        buttons.current[Number(event.key) - 1]?.click();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed]);

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
            <p className="review-card__recall" lang={front.lang}>
              {front.main}
            </p>
          )}
          <blockquote className="review-card__text" lang={back.lang}>
            {back.main}
          </blockquote>
          {back.note && (
            <p className="review-card__note" lang="en">
              {back.note}
            </p>
          )}
          <p className="review-card__question">Tu t&apos;en souvenais bien ?</p>
          <form className="review-card__ratings">
            {options.map((option, index) => (
              <RatingButton
                key={option.rating}
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                option={option}
                shortcut={index + 1}
                action={reviewAction.bind(null, cardId, option.rating)}
              />
            ))}
          </form>
        </>
      ) : (
        <>
          <blockquote className="review-card__text review-card__text--cue" lang={front.lang}>
            {front.main}
          </blockquote>
          <p className="review-card__question">{front.prompt}</p>
          <button type="button" className="review-card__reveal" onClick={() => setRevealed(true)}>
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
