import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../lib/api';
import { SEPARATOR_NAMES } from '../../../lib/csv-separator';
import { NBSP } from '../../../lib/format';
import { ImportSection } from '../../csv/import-section';

export const metadata: Metadata = { title: 'Import / export · Anglais' };

/**
 * Tab "Import / export" (MEM-52): the vocabulary to and from CSV files,
 * with the separator chosen in the settings (MEM-55). The import (MEM-53)
 * shows the lines of the file before anything is saved.
 */
export default async function EnglishImportExportPage() {
  const [items, { csvSeparator }] = await Promise.all([getItems('Vocabulary'), getPreferences()]);
  const count = items.length;

  return (
    <div className="import-export">
      <p className="import-export__separator">
        Séparateur des fichiers CSV : <strong>{SEPARATOR_NAMES[csvSeparator]}</strong>.{' '}
        <Link href="/reglages#csv">Changer dans les Réglages</Link>
      </p>

      <section className="import-export__section" aria-labelledby="export-title">
        <h2 id="export-title">Exporter</h2>
        {count === 0 ? (
          <p>
            Aucun élément de vocabulaire à exporter pour le moment.{' '}
            <Link href="/anglais/ajouter">Ajouter un premier élément</Link>
          </p>
        ) : (
          <>
            <p>
              Tout le vocabulaire, quel que soit son état : {count}
              {NBSP}élément{count > 1 ? 's' : ''}. Une ligne par élément : expression française, expression anglaise,
              thématique, phrase d’exemple en français, phrase d’exemple en anglais. Le fichier se réimporte tel quel.
            </p>
            {/* A plain link: the route sends the file, the browser downloads it. */}
            <a href="/anglais/import-export/export" className="button-link" download>
              Exporter en CSV
            </a>
          </>
        )}
      </section>

      <ImportSection type="Vocabulary" separator={csvSeparator} />
    </div>
  );
}
