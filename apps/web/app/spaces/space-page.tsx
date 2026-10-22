import Link from 'next/link';
import { getDueReviews, getItems } from '../../lib/api';
import { formatDelay, nothingDueLabel } from '../../lib/format';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import { branchesOf, rootOf } from '../../lib/mind-map';
import { reviewHref, type Space } from '../../lib/spaces';
import type { CardSummary, Item } from '../../lib/types';
import { AppHeader } from '../app-header';
import { ItemForm } from '../items/item-form';

/**
 * The page of a subject space (MEM-2): the items of a single type. Citations
 * and Cartes mentales use it (each route only says which space it is); the
 * Anglais space has its own tabs since v0.4 (app/anglais/layout.tsx).
 *
 * Server Component: the data is fetched on the Next.js server (with the
 * session's token), and the browser receives ready-made HTML.
 */
export async function SpacePage({ space }: { space: Space }) {
  const [items, spaceDue] = await Promise.all([
    getItems(space.type),
    getDueReviews(1, space.type), // this subject only
  ]);
  const now = new Date();

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        {/* MEM-28: the active menu entry says where we are; the h1 is for screen readers. */}
        <h1 className="visually-hidden page__sr-title">{space.label}</h1>
        {items.length > 0 && (
          <div className="space__actions">
            {spaceDue.total > 0 ? (
              <Link href={reviewHref(space)} className="space__review">
                {space.reviewLabel} <span className="space__review-count">{spaceDue.total}</span>
              </Link>
            ) : (
              <p className="space__due">{nothingDueLabel(spaceDue, now)}</p>
            )}
          </div>
        )}

        <ItemForm type={space.type} />

        {items.length === 0 ? (
          <p className="space__empty">{space.emptyText}</p>
        ) : (
          <ul className="items__list">
            {items.map((item) => (
              <li key={item.id}>
                <ItemContent item={item} />
                <p className="items__schedule">
                  {item.learningStatus !== 'Learning'
                    ? LEARNING_STATUS_LABELS[item.learningStatus] // not reviewed: no schedule to show (MEM-15)
                    : item.cards?.length
                      ? item.cards.map((card) => scheduleLabel(item, card, now)).join(' · ')
                      : 'Pas encore de branche : rien à réviser'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function ItemContent({ item }: { item: Item }) {
  if (item.type === 'MindMap') {
    const { nodes } = item.content;
    const branches = branchesOf(nodes).length;
    return (
      <p className="mind-map-summary">
        <Link href={`/mind-maps/${item.id}`}>{rootOf(nodes)?.label}</Link>{' '}
        <span className="mind-map-summary__meta">
          · {branches} branche{branches > 1 ? 's' : ''}, {nodes.length} idée{nodes.length > 1 ? 's' : ''}
        </span>
      </p>
    );
  }
  if (item.type === 'Quote') {
    return (
      <>
        <blockquote>{item.content.text}</blockquote>
        {item.content.author && <cite>— {item.content.author}</cite>}
      </>
    );
  }
  return (
    <>
      <p className="vocab">
        <strong lang="en">{item.content.word}</strong> <span className="vocab__arrow">→</span>{' '}
        <span>{item.content.translation}</span>
      </p>
      {item.content.example && (
        <p className="vocab__example" lang="en">
          {item.content.example}
        </p>
      )}
    </>
  );
}

const KIND_PREFIX: Record<CardSummary['kind'], string> = {
  QuoteRecall: '',
  EnglishToFrench: 'EN→FR : ',
  FrenchToEnglish: 'FR→EN : ',
  BranchRecall: '', // replaced by the branch's label
};

function scheduleLabel(item: Item, card: CardSummary, now: Date): string {
  const prefix =
    item.type === 'MindMap'
      ? `${item.content.nodes.find((node) => node.id === card.nodeId)?.label ?? '?'} : `
      : KIND_PREFIX[card.kind];
  const due = new Date(card.due);
  const when =
    due <= now ? (card.state === 'New' ? 'nouvelle, à réviser' : 'à réviser') : `dans ${formatDelay(now, due)}`;
  const label = prefix + when;
  return item.type === 'Quote' ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}
