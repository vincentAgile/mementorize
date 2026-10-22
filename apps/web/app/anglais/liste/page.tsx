import Link from 'next/link';
import { getItems } from '../../../lib/api';
import type { VocabularyItem } from '../../../lib/vocabulary-table';
import { VocabularyTable } from '../vocabulary-table';

// Tab "Liste" (MEM-26): the table of the vocabulary, with its sort, filter
// and row actions. After an edit or a deletion the page is refreshed in
// place: the table component keeps its sort and filter.
export default async function EnglishListPage() {
  const items = (await getItems('Vocabulary')) as VocabularyItem[];

  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucun élément de vocabulaire pour le moment. <Link href="/anglais/ajouter">Ajouter un premier élément</Link>
      </p>
    );
  }
  return <VocabularyTable items={items} now={new Date().toISOString()} />;
}
