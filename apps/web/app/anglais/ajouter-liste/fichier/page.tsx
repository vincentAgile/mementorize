import type { Metadata } from 'next';
import Link from 'next/link';
import { getPreferences } from '../../../../lib/api';
import { separatorName } from '../../../../lib/csv-separator';
import { ImportSection } from '../../../csv/import-section';
import { BackToChoice } from '../back-to-choice';

export const metadata: Metadata = { title: 'Importer un fichier · Ajouter une liste' };

/**
 * « Importer un fichier », a choice of « Ajouter une liste » (MEM-123): the
 * import of a CSV file of the former tab « Import / export », unchanged
 * (MEM-53, MEM-54), with the separator chosen in the settings (MEM-55). The
 * export moved to « Ma liste » (MEM-122).
 */
export default async function ImportFilePage() {
  const { csvSeparator } = await getPreferences();
  return (
    <div className="import-export">
      <BackToChoice />
      <p className="import-export__separator">
        Séparateur des fichiers CSV : <strong>{separatorName(csvSeparator)}</strong>.{' '}
        <Link href="/reglages/saisie#csv">Changer dans les Réglages</Link>
      </p>
      <ImportSection type="Vocabulary" separator={csvSeparator} />
      <p className="add-list__export">
        Pour exporter tes cartes, va dans <Link href="/anglais/liste">Ma liste</Link>.
      </p>
    </div>
  );
}
