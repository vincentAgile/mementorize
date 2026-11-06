import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { CsvForm } from '../csv-form';

export const metadata: Metadata = { title: 'Import / export · Réglages' };

// Tab "Import / export" of the Settings (MEM-78, once « Saisie et fichiers »,
// /reglages/saisie): the separator of the CSV files (MEM-55). The translation
// tools are in the tab Général.
export default async function ImportExportSettingsPage() {
  const { csvSeparator } = await getPreferences();
  return <CsvForm csvSeparator={csvSeparator} />;
}
