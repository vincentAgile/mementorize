import type { Metadata } from 'next';
import { spaceOf } from '../../lib/spaces';
import { SpacePage } from '../spaces/space-page';

export const metadata: Metadata = { title: 'Citations' };

export default function CitationsPage() {
  return <SpacePage space={spaceOf('Quote')} />;
}
