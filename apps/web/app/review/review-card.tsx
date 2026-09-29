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

interface ReviewCardProps {
  quoteId: string;
  author: string | null;
  source: string | null;
  cue: string; // first words of the quote
  text: string;
  options: RatingOption[];
}

export function ReviewCard({ quoteId, author, source, cue, text, options }: ReviewCardProps) {
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

  return (
    <article className="review-card">
      <p className="review-card__author">
        {author ?? 'Auteur inconnu'}
        {source && <span className="review-card__source"> · {source}</span>}
      </p>

      {revealed ? (
        <>
          <blockquote className="review-card__text">{text}</blockquote>
          <p className="review-card__question">Tu la connaissais bien ?</p>
          <form className="review-card__ratings">
            {options.map((option, index) => (
              <RatingButton
                key={option.rating}
                ref={(el) => {
                  buttons.current[index] = el;
                }}
                option={option}
                shortcut={index + 1}
                action={reviewAction.bind(null, quoteId, option.rating)}
              />
            ))}
          </form>
        </>
      ) : (
        <>
          <blockquote className="review-card__text review-card__text--cue">{cue}</blockquote>
          <p className="review-card__question">Récite la suite de tête, puis vérifie.</p>
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
