import Link from 'next/link';
import { getCurrentUser, getDueReviews, getItems } from '../../lib/api';
import { formatDelay } from '../../lib/format';
import { branchesOf, rootOf } from '../../lib/mind-map';
import { reviewHref, type Space } from '../../lib/spaces';
import type { CardSummary, DueReviews, Item } from '../../lib/types';
import { AppHeader } from '../app-header';
import { ItemForm } from '../items/item-form';

/**
 * The page of a subject space (MEM-2): the items of a single type. Each space
 * has its own route (/citations, /cartes-mentales, /anglais) that only says
 * which space it is.
 *
 * Server Component: the data is fetched on the Next.js server (with the
 * session's token), and the browser receives ready-made HTML.
 */
export async function SpacePage({ space }: { space: Space }) {
  const [user, items, due, spaceDue] = await Promise.all([
    getCurrentUser(),
    getItems(space.type),
    getDueReviews(1), // all subjects: the counter of the header
    getDueReviews(1, space.type), // this subject only
  ]);
  const now = new Date();

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />

      <h2 className="space__title">{space.label}</h2>
      {items.length > 0 &&
        (spaceDue.total > 0 ? (
          <Link href={reviewHref(space)} className="space__review">
            {space.reviewLabel} <span className="space__review-count">{spaceDue.total}</span>
          </Link>
        ) : (
          <p className="space__due">{nothingDueLabel(spaceDue, now)}</p>
        ))}

      <ItemForm type={space.type} />

      {items.length === 0 ? (
        <p className="space__empty">{space.emptyText}</p>
      ) : (
        <ul className="items__list">
          {items.map((item) => (
            <li key={item.id}>
              <ItemContent item={item} />
              <p className="items__schedule">
                {item.cards?.length
                  ? item.cards.map((card) => scheduleLabel(item, card, now)).join(' · ')
                  : 'Pas encore de branche : rien à réviser'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Shown instead of the review button when no card of this subject is due. */
function nothingDueLabel(due: DueReviews, now: Date): string {
  return due.nextDueAt
    ? `Rien à réviser pour le moment · prochaine révision dans ${formatDelay(now, new Date(due.nextDueAt))}`
    : 'Rien à réviser pour le moment';
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
