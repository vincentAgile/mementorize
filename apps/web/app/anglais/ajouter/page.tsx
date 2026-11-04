import type { Metadata } from 'next';
import { getItems, getPreferences } from '../../../lib/api';
import { topicsOf, type VocabularyItem } from '../../../lib/vocabulary-table';
import { AddVocabularyForm } from './add-vocabulary-form';

export const metadata: Metadata = { title: 'Ajouter une carte · Anglais' };

// Tab « Ajouter une carte » (MEM-27, renamed by MEM-123): the form to add vocabulary items one after the
// other, with the translation service chosen in the settings (MEM-44) and
// the topics already in use as suggestions (MEM-51).
export default async function EnglishAddPage() {
  const [{ translator }, items] = await Promise.all([getPreferences(), getItems('Vocabulary')]);
  const topics = topicsOf((items as VocabularyItem[]).map((item) => item.content.topic));
  return <AddVocabularyForm translator={translator} topics={topics} />;
}
