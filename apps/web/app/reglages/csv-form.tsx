'use client';

import { useActionState } from 'react';
import { CSV_SEPARATORS, SEPARATOR_NAMES } from '../../lib/csv-separator';
import type { CsvSeparator } from '../../lib/types';
import { saveCsvSeparatorAction } from './actions';

/** The separator of the CSV files of the vocabulary, export and import (MEM-55). */
export function CsvForm({ csvSeparator }: { csvSeparator: CsvSeparator }) {
  const [state, action, saving] = useActionState(saveCsvSeparatorAction, {});

  return (
    <section className="settings" id="csv">
      <h2>Fichiers CSV</h2>
      <p className="page__subtitle">
        Le séparateur des colonnes, à l’export comme à l’import du vocabulaire : point-virgule pour Excel en français,
        virgule pour la plupart des autres outils (Google Sheets, Numbers, tableurs en anglais).
      </p>

      {/* The key remounts the form with the saved value (a <select> ignores a new defaultValue). */}
      <form key={csvSeparator} action={action} className="settings__form">
        <label>
          Séparateur des fichiers CSV
          <select name="csvSeparator" defaultValue={csvSeparator}>
            {CSV_SEPARATORS.map((separator) => (
              <option key={separator} value={separator}>
                {SEPARATOR_NAMES[separator].charAt(0).toUpperCase() + SEPARATOR_NAMES[separator].slice(1)}
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
