'use client';

import { useActionState } from 'react';
import { saveReviewDelaysAction } from './actions';

/**
 * The rating buttons of the review (MEM-49): their label only by default,
 * or with the delay before the card comes back ("10 min", "3 j").
 */
export function ReviewForm({ showReviewDelays }: { showReviewDelays: boolean }) {
  const [state, action, saving] = useActionState(saveReviewDelaysAction, {});

  return (
    <section className="settings">
      <h2>Révision</h2>
      <p className="page__subtitle">
        Sous « À revoir », « Difficile » et « Bien », le délai avant que la carte revienne avec cette réponse.
      </p>

      {/* The key remounts the form with the saved value (a checkbox ignores a new defaultChecked). */}
      <form key={String(showReviewDelays)} action={action} className="settings__form">
        <label className="settings__check">
          <input type="checkbox" name="showReviewDelays" defaultChecked={showReviewDelays} />
          Afficher le délai avant la prochaine révision sur les boutons
        </label>

        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.message && <p className="notice">{state.message}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </section>
  );
}
