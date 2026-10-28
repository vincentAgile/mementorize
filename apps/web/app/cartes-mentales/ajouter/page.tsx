import type { Metadata } from 'next';
import { AddMindMapForm } from './add-mind-map-form';

export const metadata: Metadata = { title: 'Ajouter · Cartes mentales' };

/** Tab « Ajouter » (MEM-99): the creation of a mind map, alone. */
export default function MindMapsAddPage() {
  return <AddMindMapForm />;
}
