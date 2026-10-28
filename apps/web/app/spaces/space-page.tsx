import Link from 'next/link';
import { formatDelay, NBSP } from '../../lib/format';
import { LEARNING_STATUS_LABELS } from '../../lib/learning-status';
import { branchesOf, rootOf } from '../../lib/mind-map';
import type { CardSummary, Item } from '../../lib/types';

/** The items of a space, each with its schedule. */
export function SpaceItems({ items, now }: { items: Item[]; now: Date }) {
  return (
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
  );
}

function ItemContent({ item }: { item: Item }) {
  if (item.type === 'MindMap') {
    const { nodes } = item.content;
    const branches = branchesOf(nodes).length;
    const learned = item.cards?.filter((card) => card.learnedAt).length ?? 0; // MEM-48
    return (
      <p className="mind-map-summary">
        <Link href={`/mind-maps/${item.id}`}>{rootOf(nodes)?.label}</Link>{' '}
        <span className="mind-map-summary__meta">
          · {branches}
          {NBSP}branche{branches > 1 ? 's' : ''}, {nodes.length}
          {NBSP}idée{nodes.length > 1 ? 's' : ''}
          {learned > 0 && (
            <>
              {' · '}
              {learned}
              {NBSP}branche{learned > 1 ? 's' : ''} apprise{learned > 1 ? 's' : ''}
            </>
          )}
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
  const when = card.learnedAt
    ? 'appris' // MEM-48: out of the review
    : due <= now
      ? card.state === 'New'
        ? 'nouvelle, à réviser'
        : 'à réviser'
      : `dans ${formatDelay(now, due)}`;
  const label = prefix + when;
  return item.type === 'Quote' ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}
