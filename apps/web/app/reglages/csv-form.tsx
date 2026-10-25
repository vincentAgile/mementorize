'use client';

import { CSV_SEPARATORS, SEPARATOR_NAMES } from '../../lib/csv-separator';
import type { CsvSeparator } from '../../lib/types';
import { saveCsvSeparatorAction } from './actions';
import { AutoSelect } from './auto-save';

/**
 * The separator of the CSV files, export and import, of the vocabulary and
 * the quotes (MEM-55, MEM-72). Saved at the selection (MEM-79).
 */
export function CsvForm({ csvSeparator }: { csvSeparator: CsvSeparator }) {
  return (
    <section className="settings" id="csv">
      <h2>Fichiers CSV</h2>
      <p className="page__subtitle">
        Le séparateur des colonnes, à l’export comme à l’import du vocabulaire et des citations : point-virgule pour
        Excel en français, virgule pour la plupart des autres outils (Google Sheets, Numbers, tableurs en anglais).
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Séparateur des fichiers CSV"
          name="csvSeparator"
          initial={csvSeparator}
          options={CSV_SEPARATORS.map((separator) => ({
            value: separator,
            label: SEPARATOR_NAMES[separator].charAt(0).toUpperCase() + SEPARATOR_NAMES[separator].slice(1),
          }))}
          save={saveCsvSeparatorAction}
        />
      </div>
    </section>
  );
}
