'use client';

import { saveReviewDelaysAction } from './actions';
import { AutoCheckbox } from './auto-save';

/**
 * The rating buttons of the review (MEM-49): their label only by default,
 * or with the delay before the card comes back ("10 min", "3 j"). Saved
 * when the box is checked or unchecked (MEM-79).
 */
export function ReviewForm({ showReviewDelays }: { showReviewDelays: boolean }) {
  return (
    <section className="settings">
      <h2>Révision</h2>
      <p className="page__subtitle">
        Sous « À revoir », « Difficile » et « Bien », le délai avant que la carte revienne avec cette réponse.
      </p>
      <div className="settings__form">
        <AutoCheckbox
          label="Afficher le délai avant la prochaine révision sur les boutons"
          name="showReviewDelays"
          initial={showReviewDelays}
          save={saveReviewDelaysAction}
        />
      </div>
    </section>
  );
}
