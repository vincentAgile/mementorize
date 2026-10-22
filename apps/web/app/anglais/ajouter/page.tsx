import type { Metadata } from 'next';
import { AddVocabularyForm } from './add-vocabulary-form';

export const metadata: Metadata = { title: 'Ajouter · Anglais' };

// Tab "Ajouter" (MEM-27): the form to add vocabulary items one after the other.
export default function EnglishAddPage() {
  return <AddVocabularyForm />;
}
