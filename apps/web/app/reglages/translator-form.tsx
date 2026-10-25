'use client';

import { TRANSLATOR_NAMES } from '../../lib/translate-url';
import type { Translator } from '../../lib/types';
import { saveTranslatorAction } from './actions';
import { AutoSelect } from './auto-save';

const CHOICES: Translator[] = ['DeepL', 'Google'];

/**
 * Choice of the service of the translate buttons (MEM-44): DeepL by
 * default, or Google Translate. Saved at the selection (MEM-79).
 */
export function TranslatorForm({ translator }: { translator: Translator }) {
  return (
    <section className="settings">
      <h2>Traduction</h2>
      <p className="page__subtitle">
        Le service qu’ouvrent les boutons « Traduire », en face des champs du vocabulaire, avec le texte déjà saisi.
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Traduire avec"
          name="translator"
          initial={translator}
          options={CHOICES.map((choice) => ({ value: choice, label: TRANSLATOR_NAMES[choice] }))}
          save={saveTranslatorAction}
        />
      </div>
    </section>
  );
}
