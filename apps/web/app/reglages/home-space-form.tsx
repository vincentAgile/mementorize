'use client';

import { useActionState } from 'react';
import { SPACES } from '../../lib/spaces';
import type { ItemType } from '../../lib/types';
import { saveHomeSpaceAction } from './actions';

/** Choice of the subject space opened on arrival (MEM-6). */
export function HomeSpaceForm({ homeSpace }: { homeSpace: ItemType }) {
  const [state, action, saving] = useActionState(saveHomeSpaceAction, {});

  return (
    <section className="settings">
      <h2>Page d’accueil</h2>
      <p className="page__subtitle">
        L’espace qui s’ouvre quand tu arrives sur Mementorize, après la connexion et depuis l’e-mail de rappel.
      </p>

      {/* The key remounts the form with the saved value (a <select> ignores a new defaultValue). */}
      <form key={homeSpace} action={action} className="settings__form">
        <label>
          Ouvrir sur
          <select name="homeSpace" defaultValue={homeSpace}>
            {SPACES.map((space) => (
              <option key={space.type} value={space.type}>
                {space.label}
              </option>
            ))}
          </select>
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
