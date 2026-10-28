import type { Metadata } from 'next';
import { spaceOf } from '../../../lib/spaces';
import { PreparePage } from '../../spaces/prepare-page';

export const metadata: Metadata = { title: 'Préparer la session · Anglais' };

/** MEM-94: the list of a learning session, before it starts; ?liste= its composition (MEM-95). */
export default async function EnglishPreparePage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  const { liste } = await searchParams;
  return <PreparePage space={{ ...spaceOf('Vocabulary'), type: 'Vocabulary' }} liste={liste} />;
}
