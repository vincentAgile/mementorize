'use client';

import type { ReviewRating } from '../../lib/types';

/**
 * The self-assessment of a card (MEM-46): three ratings, then « Appris ».
 * « Appris » is not a rating: the card, or the vocabulary item, leaves the
 * review (MEM-22).
 */
export type Answer = Exclude<ReviewRating, 'Easy'> | 'Learned';

const ANSWERS: { answer: Answer; label: string }[] = [
  { answer: 'Again', label: 'À revoir' },
  { answer: 'Hard', label: 'Difficile' },
  { answer: 'Good', label: 'Bien' },
  { answer: 'Learned', label: 'Appris' },
];

/** The keyboard shortcuts, not shown on the buttons: 1 À revoir … 4 Appris. */
export function answerOfKey(key: string, withLearned: boolean): Answer | undefined {
  const index = ['1', '2', '3', '4'].indexOf(key);
  const answer = ANSWERS[index]?.answer;
  return answer === 'Learned' && !withLearned ? undefined : answer;
}

interface RatingButtonsProps {
  onAnswer: (answer: Answer) => void;
  /** Offer « Appris » (the fourth button). */
  withLearned: boolean;
  /** When the card comes back with each rating ("10 min"); none for « Appris ». */
  delays?: Partial<Record<Answer, string>>;
  disabled?: boolean;
}

export function RatingButtons({ onAnswer, withLearned, delays, disabled = false }: RatingButtonsProps) {
  return (
    <div className="review-card__ratings">
      {ANSWERS.filter(({ answer }) => withLearned || answer !== 'Learned').map(({ answer, label }, index) => (
        <button
          key={answer}
          type="button"
          className={`rating rating--${answer.toLowerCase()}`}
          title={`Raccourci : ${index + 1}`}
          disabled={disabled}
          onClick={() => onAnswer(answer)}
        >
          <span className="rating__label">{label}</span>
          {delays?.[answer] && <span className="rating__delay">{delays[answer]}</span>}
        </button>
      ))}
    </div>
  );
}
