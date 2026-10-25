import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { CsvForm } from '../csv-form';
import { TranslatorForm } from '../translator-form';

export const metadata: Metadata = { title: 'Saisie et fichiers · Réglages' };

// Tab "Saisie et fichiers" of the Settings (MEM-78): the translation service
// of the forms (MEM-44) and the separator of the CSV files (MEM-55).
export default async function InputSettingsPage() {
  const { translator, csvSeparator } = await getPreferences();
  return (
    <>
      <TranslatorForm translator={translator} />
      <CsvForm csvSeparator={csvSeparator} />
    </>
  );
}
