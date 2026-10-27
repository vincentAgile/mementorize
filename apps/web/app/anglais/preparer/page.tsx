import type { Metadata } from 'next';
import { spaceOf } from '../../../lib/spaces';
import { PreparePage } from '../../spaces/prepare-page';

export const metadata: Metadata = { title: 'Préparer la session · Anglais' };

/** MEM-94: the list of a learning session, before it starts. */
export default function EnglishPreparePage() {
  return <PreparePage space={{ ...spaceOf('Vocabulary'), type: 'Vocabulary' }} />;
}
