import Link from 'next/link';
import { ITEM_NOUN, agree, countOf } from '../../../../lib/nouns';

/**
 * MEM-118: « 88 cartes ajoutées, 12 déjà présentes ignorées. », with where to
 * go next: the list of the vocabulary (on the items « En attente » when they
 * didn't join the queue) and the learning.
 */
export function AddedMessage({ added, skipped, queue }: { added: number; skipped: number; queue: boolean }) {
  return (
    <p className="notice catalog-added" role="status">
      <strong>
        {added > 0 ? `${countOf(added, ITEM_NOUN)} ${agree('ajouté', ITEM_NOUN, added)}` : 'Aucune carte ajoutée'}
      </strong>
      {added > 0 && !queue && ', en attente'}
      {skipped > 0 &&
        `, ${skipped}\u00a0déjà ${agree('présent', ITEM_NOUN, skipped)} ${agree('ignoré', ITEM_NOUN, skipped)}`}
      .{' '}
      <span className="catalog-added__links">
        <Link href={queue ? '/anglais/liste' : '/anglais/liste?etat=Waiting'}>Voir dans ma liste</Link>
        <Link href="/anglais">Apprendre</Link>
      </span>
    </p>
  );
}
