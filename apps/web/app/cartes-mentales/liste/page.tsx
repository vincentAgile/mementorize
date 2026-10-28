import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems } from '../../../lib/api';
import { SpaceItems } from '../../spaces/space-page';

export const metadata: Metadata = { title: 'Liste · Cartes mentales' };

/** Tab « Liste » (MEM-97): the mind maps of the space. */
export default async function MindMapsListPage() {
  const items = await getItems('MindMap');
  if (items.length === 0) {
    return (
      <p className="space__empty">
        Aucune carte mentale pour le moment. <Link href="/cartes-mentales/ajouter">Créer une première carte</Link>
      </p>
    );
  }
  return <SpaceItems items={items} now={new Date()} />;
}
