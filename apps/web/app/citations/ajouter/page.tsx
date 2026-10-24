import type { Metadata } from 'next';
import { ItemForm } from '../../items/item-form';

export const metadata: Metadata = { title: 'Ajouter · Citations' };

// Tab "Ajouter" of the Citations space (MEM-66).
export default function QuotesAddPage() {
  return <ItemForm type="Quote" />;
}
