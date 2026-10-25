import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../lib/api';
import { SEPARATOR_NAMES } from '../../../lib/csv-separator';
import { countOf, QUOTE_NOUN } from '../../../lib/nouns';
import { ImportSection } from '../../csv/import-section';

export const metadata: Metadata = { title: 'Import / export · Citations' };

/**
 * Tab "Import / export" of the Citations space (MEM-72): the quotes to and
 * from CSV files (text, author, source), with the separator chosen in the
 * settings (MEM-55). As in the Anglais space, the import shows the lines of
 * the file before anything is saved.
 */
export default async function QuotesImportExportPage() {
  const [items, { csvSeparator }] = await Promise.all([getItems('Quote'), getPreferences()]);
  const count = items.length;

  return (
    <div className="import-export">
      <p className="import-export__separator">
        Séparateur des fichiers CSV : <strong>{SEPARATOR_NAMES[csvSeparator]}</strong>.{' '}
        <Link href="/reglages/saisie#csv">Changer dans les Réglages</Link>
      </p>

      <section className="import-export__section" aria-labelledby="export-title">
        <h2 id="export-title">Exporter</h2>
        {count === 0 ? (
          <p>
            Aucune citation à exporter pour le moment.{' '}
            <Link href="/citations/ajouter">Ajouter une première citation</Link>
          </p>
        ) : (
          <>
            <p>
              Toutes les citations, quel que soit leur état : {countOf(count, QUOTE_NOUN)}. Une ligne par citation :
              texte, auteur, source. Le fichier se réimporte tel quel.
            </p>
            {/* A plain link: the route sends the file, the browser downloads it. */}
            <a href="/citations/import-export/export" className="button-link" download>
              Exporter en CSV
            </a>
          </>
        )}
      </section>

      <ImportSection type="Quote" separator={csvSeparator} />
    </div>
  );
}
