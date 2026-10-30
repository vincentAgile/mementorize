import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../lib/api';
import { LEARNING_STATUS_LABELS } from '../../../lib/learning-status';
import type { QuoteItem } from '../../../lib/quote-table';
import type { LearningStatus } from '../../../lib/types';
import { QuoteTable } from '../quote-table';

export const metadata: Metadata = { title: 'Liste · Citations' };

// Tab "Liste" of the Citations space (MEM-69): the table of the quotes, with
// its sort, search, filter, pages and row actions. After an edit or a
// deletion the page is refreshed in place: the table keeps its state.
export default async function QuotesListPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  // ?etat=Waiting: opened filtered on a state (the link of "Apprendre · Réviser").
  const { etat } = await searchParams;
  const initialStatus = etat && etat in LEARNING_STATUS_LABELS ? (etat as LearningStatus) : undefined;
  const [items, { vocabularyPageSize, usageMode }] = await Promise.all([getItems('Quote'), getPreferences()]);

  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucune citation pour le moment. <Link href="/citations/ajouter">Ajouter une première citation</Link>
      </p>
    );
  }
  return (
    <QuoteTable
      items={items as QuoteItem[]}
      now={new Date().toISOString()}
      pageSize={vocabularyPageSize}
      initialStatus={initialStatus}
      advanced={usageMode === 'Advanced'} // MEM-111
    />
  );
}
