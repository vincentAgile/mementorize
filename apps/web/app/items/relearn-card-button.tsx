'use client';

import { useFormStatus } from 'react-dom';
import { relearnCardAction } from './actions';

/**
 * « Remettre en révision » (MEM-48): a quote or a mind map branch marked
 * « Appris » goes back to the review, with the schedule it had. `what` names
 * it for screen readers: « Remettre en révision la branche « Sommeil » ».
 */
export function RelearnCardButton({ cardId, what }: { cardId: string; what: string }) {
  return (
    <form action={relearnCardAction.bind(null, cardId)} className="relearn-card">
      <Submit what={what} />
    </form>
  );
}

function Submit({ what }: { what: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="relearn-card__button" disabled={pending}>
      Remettre en révision<span className="visually-hidden"> {what}</span>
    </button>
  );
}
