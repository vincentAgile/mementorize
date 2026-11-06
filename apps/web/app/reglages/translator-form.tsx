'use client';

import { TRANSLATOR_CHOICES } from '../../lib/translate-url';
import type { Translator } from '../../lib/types';
import { saveTranslatorAction } from './actions';
import { AutoSelect } from './auto-save';

/**
 * Choice of the service of the translate buttons (MEM-44): DeepL towards
 * British English by default, DeepL towards American English, or Google
 * Translate. Saved at the selection (MEM-79).
 */
export function TranslatorForm({ translator }: { translator: Translator }) {
  return (
    <section className="settings">
      <h2>Outils de traduction</h2>
      <p className="page__subtitle">
        Le service qu’ouvrent les boutons « Traduire », en face des champs du vocabulaire, avec le texte déjà saisi.
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Traduire avec"
          name="translator"
          initial={translator}
          options={TRANSLATOR_CHOICES}
          save={saveTranslatorAction}
        />
      </div>
    </section>
  );
}
