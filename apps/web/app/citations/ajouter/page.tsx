import type { Metadata } from 'next';
import { getItems } from '../../../lib/api';
import { authorsOf, type QuoteItem } from '../../../lib/quote-table';
import { AddQuoteForm } from './add-quote-form';

export const metadata: Metadata = { title: 'Ajouter · Citations' };

// Tab "Ajouter" of the Citations space (MEM-71): the form to add quotes one
// after the other, with the authors already entered as suggestions.
export default async function QuotesAddPage() {
  const items = (await getItems('Quote')) as QuoteItem[];
  return <AddQuoteForm authors={authorsOf(items)} />;
}
