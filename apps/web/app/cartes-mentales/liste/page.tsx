import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../lib/api';
import { type MindMapItem, toMindMapRow } from '../../../lib/mind-map-table';
import { MindMapTable } from '../mind-map-table';

export const metadata: Metadata = { title: 'Liste · Cartes mentales' };

/**
 * Tab « Liste » (MEM-98): the table of the mind maps. After a deletion the
 * page is refreshed in place: the table keeps its sort, search and page.
 */
export default async function MindMapsListPage() {
  const [items, { vocabularyPageSize }] = await Promise.all([getItems('MindMap'), getPreferences()]);
  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucune carte mentale pour le moment. <Link href="/cartes-mentales/ajouter">Créer une première carte</Link>
      </p>
    );
  }
  return (
    <MindMapTable
      rows={(items as MindMapItem[]).map(toMindMapRow)}
      now={new Date().toISOString()}
      pageSize={vocabularyPageSize}
    />
  );
}
