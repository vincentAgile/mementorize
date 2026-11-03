import type { Metadata } from 'next';
import { getCatalogLists } from '../../../../lib/admin-api';
import { CatalogTable } from './catalog-table';

export const metadata: Metadata = { title: 'Catalogue' };

/** MEM-116: the predefined lists of vocabulary, made here to be offered to the users. */
export default async function CatalogPage() {
  return <CatalogTable lists={await getCatalogLists()} />;
}
