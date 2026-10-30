import type { Metadata } from 'next';
import { spaceOf } from '../../../lib/spaces';
import { PreparePage } from '../../spaces/prepare-page';

export const metadata: Metadata = { title: 'Préparer la session · Citations' };

/** MEM-94: the list of a learning session of quotes, before it starts; ?liste= its composition, as in Anglais (MEM-95). */
export default async function QuotesPreparePage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  const { liste } = await searchParams;
  return <PreparePage space={{ ...spaceOf('Quote'), type: 'Quote' }} liste={liste} />;
}
