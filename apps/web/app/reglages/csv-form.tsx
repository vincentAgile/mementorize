'use client';

import { useId } from 'react';
import { SEPARATOR_SHORTCUTS, TAB_LABEL } from '../../lib/csv-separator';
import { saveCsvSeparatorAction } from './actions';
import { SaveStatus, useAutoSave } from './auto-save';

/** The field shows « Tab » for the tab, which can't be typed in it. */
const toField = (separator: string) => (separator === '\t' ? TAB_LABEL : separator);
const fromField = (text: string) => (text.toLowerCase() === TAB_LABEL.toLowerCase() ? '\t' : text);

/**
 * The separator of the CSV files, export and import, of the vocabulary and
 * the quotes (MEM-55, MEM-72): any single character since MEM-80, but the
 * double quote and the line breaks. Three shortcuts: « ; », « , » and the
 * tab. Saved on Enter or when the focus leaves the field, or at once with a
 * shortcut (MEM-79).
 */
export function CsvForm({ csvSeparator }: { csvSeparator: string }) {
  const field = useAutoSave(toField(csvSeparator), (text: string) => saveCsvSeparatorAction(fromField(text)));
  const inputId = useId();
  const statusId = useId();
  const hintId = useId();
  const confirm = () => {
    if (field.value !== field.saved) field.commit(field.value);
  };

  return (
    <section className="settings" id="csv">
      <h2>Fichiers CSV</h2>
      <p className="page__subtitle">
        Le séparateur des colonnes, à l’export comme à l’import du vocabulaire et des citations : point-virgule pour
        Excel en français, virgule pour la plupart des autres outils (Google Sheets, Numbers, tableurs en anglais), ou
        tout autre caractère.
      </p>
      <div className="settings__form">
        <div className="settings__field">
          <label htmlFor={inputId}>Séparateur des fichiers CSV</label>
          <div className="separator-field">
            <input
              id={inputId}
              name="csvSeparator"
              className="separator-field__input"
              value={field.value}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={field.status === 'invalid' || undefined}
              aria-describedby={`${statusId} ${hintId}`}
              // Focused: all selected, so that the character typed replaces it.
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => field.setValue(event.target.value)}
              onBlur={confirm}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirm();
                }
              }}
            />
            <span className="separator-field__shortcuts" role="group" aria-label="Raccourcis">
              {SEPARATOR_SHORTCUTS.map(({ char, label }) => (
                <button
                  key={label}
                  type="button"
                  className="separator-field__shortcut"
                  aria-pressed={fromField(field.value) === char}
                  onClick={() => field.commit(toField(char))}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          <SaveStatus id={statusId} status={field.status} message={field.message} onRetry={field.retry} />
        </div>
        <p id={hintId} className="settings__hint">
          {field.value === ' '
            ? 'Attention : les textes contiennent presque toujours des espaces ; ils seront entourés de guillemets dans les fichiers.'
            : 'Un seul caractère. Le guillemet et le retour à la ligne ne peuvent pas servir de séparateur.'}
        </p>
      </div>
    </section>
  );
}
