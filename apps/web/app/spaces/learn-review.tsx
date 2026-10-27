import Link from 'next/link';
import { getDueReviews, getItems } from '../../lib/api';
import { NBSP } from '../../lib/format';
import { countOf } from '../../lib/nouns';
import { reviewHref, type Space } from '../../lib/spaces';
import { NothingDue } from '../nothing-due';

const plural = (count: number, one: string, many: string) => `${count}${NBSP}${count > 1 ? many : one}`;

/**
 * Tab "Apprendre · Réviser" of a space with a learning process: the
 * Anglais space (MEM-25) and the Citations space (MEM-66), the default tab
 * of both. Two cards, one per process; each shows its action, or says why
 * there is nothing to do. The end of a learning or review session comes
 * back here.
 */
export async function LearnReview({ space }: { space: Space }) {
  const [items, due] = await Promise.all([getItems(space.type), getDueReviews(1, space.type)]);
  const { noun } = space;
  const toLearn = items.filter((item) => item.learningStatus === 'ToLearn').length;
  const waiting = items.filter((item) => item.learningStatus === 'Waiting').length; // MEM-61

  if (items.length === 0) {
    return (
      <section className="learn-review__empty">
        <p>{space.emptyText}</p>
        <Link href={`${space.href}/ajouter`} className="space__review">
          Ajouter {noun.feminine ? 'une première' : 'un premier'} {noun.one}
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
            <p>{countOf(toLearn, noun)} à apprendre, par sessions de cinq.</p>
            {/* MEM-94: the session is prepared first. */}
            <Link href={space.prepareHref ?? space.href} className="space__review space__review--learn">
              Apprendre <span className="space__review-count">{toLearn}</span>
            </Link>
          </>
        ) : waiting > 0 ? (
          // MEM-61: the items "En attente" are not learned until they join the queue.
          <p className="learn-review__none">
            Rien à apprendre · {countOf(waiting, noun)} en attente.{' '}
            <Link href={`${space.href}/liste?etat=Waiting`}>Voir les {noun.many} en attente</Link>
          </p>
        ) : (
          <p className="learn-review__none">
            Rien à apprendre. <Link href={`${space.href}/ajouter`}>Ajouter des {noun.many}</Link>
          </p>
        )}
      </section>

      <section className="learn-review__card" aria-labelledby="review-title">
        <h3 id="review-title">Réviser</h3>
        {due.total > 0 ? (
          <>
            <p>{plural(due.total, 'carte à réviser', 'cartes à réviser')} aujourd’hui.</p>
            <Link href={reviewHref(space)} className="space__review">
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
