import Link from 'next/link';
import { getDueReviews, getItems } from '../../lib/api';
import { nothingDueLabel } from '../../lib/format';
import { reviewHref, spaceOf } from '../../lib/spaces';

const SPACE = spaceOf('Vocabulary');

// Tab "Apprendre · Réviser" (MEM-24, MEM-25): where the sessions start.
export default async function EnglishLearnReviewPage() {
  const [items, due] = await Promise.all([getItems('Vocabulary'), getDueReviews(1, 'Vocabulary')]);
  const toLearn = items.filter((item) => item.learningStatus === 'ToLearn').length;

  if (items.length === 0) {
    return <p className="space__empty">{SPACE.emptyText}</p>;
  }

  return (
    <div className="space__actions">
      {toLearn > 0 && (
        <Link href="/apprendre" className="space__review space__review--learn">
          Apprendre <span className="space__review-count">{toLearn}</span>
        </Link>
      )}
      {due.total > 0 ? (
        <Link href={reviewHref(SPACE)} className="space__review">
          {SPACE.reviewLabel} <span className="space__review-count">{due.total}</span>
        </Link>
      ) : (
        <p className="space__due">{nothingDueLabel(due, new Date())}</p>
      )}
    </div>
  );
}
