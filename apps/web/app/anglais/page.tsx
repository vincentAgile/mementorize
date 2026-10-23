import type { Metadata } from 'next';
import Link from 'next/link';
import { getDueReviews, getItems } from '../../lib/api';
import { NBSP } from '../../lib/format';
import { NothingDue } from '../nothing-due';
import { reviewHref, spaceOf } from '../../lib/spaces';

export const metadata: Metadata = { title: 'Apprendre · Réviser · Anglais' };

const SPACE = spaceOf('Vocabulary');

const plural = (count: number, one: string, many: string) => `${count}${NBSP}${count > 1 ? many : one}`;

/**
 * Tab "Apprendre · Réviser" (MEM-25), the default one: where the sessions of
 * the day start. Two cards, one per process; each shows its action, or says
 * why there is nothing to do. The end of a learning or review session comes
 * back here (/anglais).
 */
export default async function EnglishLearnReviewPage() {
  const [items, due] = await Promise.all([getItems('Vocabulary'), getDueReviews(1, 'Vocabulary')]);
  const toLearn = items.filter((item) => item.learningStatus === 'ToLearn').length;

  if (items.length === 0) {
    return (
      <section className="learn-review__empty">
        <p>Aucun élément de vocabulaire pour le moment : commence par ajouter un mot, une expression ou une phrase.</p>
        <Link href="/anglais/ajouter" className="space__review">
          Ajouter un premier élément
        </Link>
      </section>
    );
  }

  return (
    <div className="learn-review">
      <section className="learn-review__card" aria-labelledby="learn-title">
        <h3 id="learn-title">Apprendre</h3>
        {toLearn > 0 ? (
          <>
            <p>{plural(toLearn, 'élément à apprendre', 'éléments à apprendre')}, par sessions de cinq.</p>
            <Link href="/apprendre" className="space__review space__review--learn">
              Apprendre <span className="space__review-count">{toLearn}</span>
            </Link>
          </>
        ) : (
          <p className="learn-review__none">
            Rien à apprendre. <Link href="/anglais/ajouter">Ajouter des éléments</Link>
          </p>
        )}
      </section>

      <section className="learn-review__card" aria-labelledby="review-title">
        <h3 id="review-title">Réviser</h3>
        {due.total > 0 ? (
          <>
            <p>{plural(due.total, 'carte à réviser', 'cartes à réviser')} aujourd’hui.</p>
            <Link href={reviewHref(SPACE)} className="space__review">
              Réviser <span className="space__review-count">{due.total}</span>
            </Link>
          </>
        ) : (
          <NothingDue due={due} now={new Date()} className="learn-review__none" />
        )}
      </section>
    </div>
  );
}
