import type { Metadata } from 'next';
import { ItemForm } from '../../items/item-form';

export const metadata: Metadata = { title: 'Ajouter · Cartes mentales' };

/** Tab « Ajouter » (MEM-97): the creation of a mind map. */
export default function MindMapsAddPage() {
  return <ItemForm type="MindMap" />;
}
