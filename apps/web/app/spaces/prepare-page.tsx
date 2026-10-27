import Link from 'next/link';
import { getItems } from '../../lib/api';
import { candidatesOf } from '../../lib/session-preparation';
import type { Space } from '../../lib/spaces';
import type { ListType } from '../../lib/types';
import { PrepareSession } from './prepare-session';

/**
 * MEM-94: the page « Préparer la session d’apprentissage », opened by
 * « Apprendre » in the tab Apprendre · Réviser of the Anglais and Citations
 * spaces. The items that can be learned are loaded here; the list is
 * prepared in the browser, and the queue is only touched by « Commencer ».
 */
export async function PreparePage({ space }: { space: Space & { type: ListType } }) {
  const candidates = candidatesOf(await getItems(space.type));
  if (candidates.length === 0) {
    return (
      <section className="learn-review__empty">
        <h2 className="prepare__title">Rien à apprendre pour le moment</h2>
        <p>
          Aucun{space.noun.feminine ? 'e' : ''} {space.noun.one} à apprendre ou en attente.{' '}
          <Link href={`${space.href}/ajouter`}>Ajouter des {space.noun.many}</Link>
        </p>
      </section>
    );
  }
  return <PrepareSession type={space.type} candidates={candidates} noun={space.noun} cancelHref={space.href} />;
}
