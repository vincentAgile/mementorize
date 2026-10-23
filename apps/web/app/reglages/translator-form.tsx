'use client';

import { useActionState } from 'react';
import { TRANSLATOR_NAMES } from '../../lib/translate-url';
import type { Translator } from '../../lib/types';
import { saveTranslatorAction } from './actions';

const CHOICES: Translator[] = ['DeepL', 'Google'];

/** Choice of the service of the translate buttons (MEM-44): DeepL by default, or Google Translate. */
export function TranslatorForm({ translator }: { translator: Translator }) {
  const [state, action, saving] = useActionState(saveTranslatorAction, {});

  return (
    <section className="settings">
      <h2>Traduction</h2>
      <p className="page__subtitle">
        Le service qu’ouvrent les boutons « Traduire », en face des champs du vocabulaire, avec le texte déjà saisi.
      </p>

      {/* The key remounts the form with the saved value (a <select> ignores a new defaultValue). */}
      <form key={translator} action={action} className="settings__form">
        <label>
          Traduire avec
          <select name="translator" defaultValue={translator}>
            {CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {TRANSLATOR_NAMES[choice]}
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
