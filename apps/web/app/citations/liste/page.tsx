import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems } from '../../../lib/api';
import { SpaceItems } from '../../spaces/space-page';

export const metadata: Metadata = { title: 'Liste · Citations' };

// Tab "Liste" of the Citations space (MEM-66): the quotes, the most recent first.
export default async function QuotesListPage() {
  const items = await getItems('Quote');
  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucune citation pour le moment. <Link href="/citations/ajouter">Ajouter une première citation</Link>
      </p>
    );
  }
  return (
    <div className="page--reading">
      <SpaceItems items={items} now={new Date()} />
    </div>
  );
}
