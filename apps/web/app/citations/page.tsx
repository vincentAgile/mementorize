import type { Metadata } from 'next';
import { spaceOf } from '../../lib/spaces';
import { LearnReview } from '../spaces/learn-review';

export const metadata: Metadata = { title: 'Apprendre · Réviser · Citations' };

/** Tab "Apprendre · Réviser" of the Citations space (MEM-66), the default one: as in the Anglais space. */
export default function QuotesLearnReviewPage() {
  return <LearnReview space={spaceOf('Quote')} />;
}
