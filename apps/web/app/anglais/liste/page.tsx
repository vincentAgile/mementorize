import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../lib/api';
import { LEARNING_STATUS_LABELS } from '../../../lib/learning-status';
import type { LearningStatus } from '../../../lib/types';
import type { VocabularyItem } from '../../../lib/vocabulary-table';
import { VocabularyTable } from '../vocabulary-table';

export const metadata: Metadata = { title: 'Liste · Anglais' };

// Tab "Liste" (MEM-26): the table of the vocabulary, with its sort, filter
// and row actions. After an edit or a deletion the page is refreshed in
// place: the table component keeps its sort and filter.
export default async function EnglishListPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  // ?etat=Waiting: opened filtered on a state (the link of "Apprendre · Réviser", MEM-61).
  const { etat } = await searchParams;
  const initialStatus = etat && etat in LEARNING_STATUS_LABELS ? (etat as LearningStatus) : undefined;
  const [all, { translator, vocabularyPageSize }] = await Promise.all([getItems('Vocabulary'), getPreferences()]);
  const items = all as VocabularyItem[];

  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucun élément de vocabulaire pour le moment. <Link href="/anglais/ajouter">Ajouter un premier élément</Link>
      </p>
    );
  }
  return (
    <VocabularyTable
      items={items}
      now={new Date().toISOString()}
      translator={translator}
      pageSize={vocabularyPageSize}
      initialStatus={initialStatus}
    />
  );
}
