import type { Metadata } from 'next';
import { spaceOf } from '../../lib/spaces';
import { LearnReview } from '../spaces/learn-review';

export const metadata: Metadata = { title: 'Réviser · Cartes mentales' };

/**
 * Tab « Réviser » (MEM-97), the default one: as the tab « Apprendre ·
 * Réviser » of the other spaces, with the review only (a new map is
 * reviewed at once, branch by branch). The end of a review comes back here.
 */
export default function MindMapsReviewPage() {
  return <LearnReview space={spaceOf('MindMap')} />;
}
