'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { wordCount } from '../../../../lib/catalog';
import type { CatalogListSummary } from '../../../../lib/types';
import { type AddFromListResult, addFromListAction } from './actions';
import { AddedMessage } from './added-message';
import { LevelBadge } from './level-badge';

/**
 * MEM-118: a predefined list, as a card: its level, title, description,
 * number of words and those already in the vocabulary; « Voir le contenu »
 * and « Tout ajouter » (in the learning queue), off when every word is there.
 */
export function ListCard({ list }: { list: CatalogListSummary }) {
  const [result, setResult] = useState<AddFromListResult | null>(null);
  const [pending, startTransition] = useTransition();
  const allThere = list.owned >= list.entries;
  const titleId = `catalog-list-${list.id}`;

  return (
    <article className="catalog-card" aria-labelledby={titleId}>
      <LevelBadge level={list.level} />
      <h2 id={titleId} className="catalog-card__title">
        {list.title}
      </h2>
      {list.description && <p className="catalog-card__description">{list.description}</p>}
      <p className="catalog-card__count">
        {wordCount(list.entries)}
        {list.owned > 0 && <span className="catalog-card__owned"> · {list.owned}&nbsp;déjà dans ma liste</span>}
      </p>
      <div className="catalog-card__actions">
        <Link href={`/anglais/ajouter-liste/predefinies/${list.id}`} className="button-link button-link--secondary">
          Voir le contenu
        </Link>
        <button
          type="button"
          disabled={allThere || pending}
          aria-describedby={allThere ? `${titleId}-all` : undefined}
          onClick={() => startTransition(async () => setResult(await addFromListAction(list.id, null, true)))}
        >
          {pending ? 'Ajout…' : 'Tout ajouter'}
        </button>
      </div>
      {allThere && !(result && 'added' in result) && (
        <p id={`${titleId}-all`} className="catalog-card__all">
          Tout est déjà dans ta liste
        </p>
      )}
      {result && 'added' in result && <AddedMessage {...result} />}
      {result && 'error' in result && (
        <p className="form-error" role="alert">
          {result.error}
        </p>
      )}
    </article>
  );
}
