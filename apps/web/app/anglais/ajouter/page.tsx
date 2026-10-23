import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { AddVocabularyForm } from './add-vocabulary-form';

export const metadata: Metadata = { title: 'Ajouter · Anglais' };

// Tab "Ajouter" (MEM-27): the form to add vocabulary items one after the
// other, with the translation service chosen in the settings (MEM-44).
export default async function EnglishAddPage() {
  const { translator } = await getPreferences();
  return <AddVocabularyForm translator={translator} />;
}
