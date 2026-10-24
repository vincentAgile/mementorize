import type { Metadata } from 'next';
import { spaceOf } from '../../lib/spaces';
import { LearnReview } from '../spaces/learn-review';

export const metadata: Metadata = { title: 'Apprendre · Réviser · Anglais' };

/**
 * Tab "Apprendre · Réviser" (MEM-25), the default one: where the sessions of
 * the day start. Shared with the Citations space (MEM-66).
 */
export default function EnglishLearnReviewPage() {
  return <LearnReview space={spaceOf('Vocabulary')} />;
}
