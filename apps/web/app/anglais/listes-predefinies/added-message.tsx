import Link from 'next/link';
import { ITEM_NOUN, agree, countOf } from '../../../lib/nouns';

/**
 * MEM-118: « 88 éléments ajoutés, 12 déjà présents ignorés. », with where to
 * go next: the list of the vocabulary (on the items « En attente » when they
 * didn't join the queue) and the learning.
 */
export function AddedMessage({ added, skipped, queue }: { added: number; skipped: number; queue: boolean }) {
  return (
    <p className="notice catalog-added" role="status">
      <strong>
        {added > 0 ? `${countOf(added, ITEM_NOUN)} ${agree('ajouté', ITEM_NOUN, added)}` : 'Aucun élément ajouté'}
      </strong>
      {added > 0 && !queue && ', en attente'}
      {skipped > 0 && `, ${skipped} déjà présent${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}`}.{' '}
      <span className="catalog-added__links">
        <Link href={queue ? '/anglais/liste' : '/anglais/liste?etat=Waiting'}>Voir dans ma liste</Link>
        <Link href="/anglais">Apprendre</Link>
      </span>
    </p>
  );
}
