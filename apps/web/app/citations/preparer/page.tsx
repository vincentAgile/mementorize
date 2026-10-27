import type { Metadata } from 'next';
import { spaceOf } from '../../../lib/spaces';
import { PreparePage } from '../../spaces/prepare-page';

export const metadata: Metadata = { title: 'Préparer la session · Citations' };

/** MEM-94: the list of a learning session of quotes, before it starts. */
export default function QuotesPreparePage() {
  return <PreparePage space={{ ...spaceOf('Quote'), type: 'Quote' }} />;
}
