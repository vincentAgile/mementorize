import type { Metadata } from 'next';
import { spaceOf } from '../../lib/spaces';
import { SpacePage } from '../spaces/space-page';

export const metadata: Metadata = { title: 'Cartes mentales' };

export default function MindMapsPage() {
  return <SpacePage space={spaceOf('MindMap')} />;
}
