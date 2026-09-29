import Link from 'next/link';
import { getCurrentUser, getDueReviews, getItems } from '../lib/api';
import { formatDelay } from '../lib/format';
import type { CardSummary, Item, ItemType } from '../lib/types';
import { AppHeader } from './app-header';
import { ItemForm } from './items/item-form';

const FILTERS: { type?: ItemType; label: string }[] = [
  { label: 'Tout' },
  { type: 'Quote', label: 'Citations' },
  { type: 'Vocabulary', label: 'Vocabulaire' },
];

// Server Component: the data is fetched on the Next.js server (with the
// session's token), and the browser receives ready-made HTML.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: rawType } = await searchParams;
  const type = rawType === 'Quote' || rawType === 'Vocabulary' ? rawType : undefined;

  const [user, items, due] = await Promise.all([getCurrentUser(), getItems(type), getDueReviews(1)]);
  const now = new Date();

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />

      {/* key: switching filter resets the form to the filtered type */}
      <ItemForm key={type ?? 'all'} defaultType={type} />

      <nav className="filters" aria-label="Filtrer par type">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.type ? `/?type=${filter.type}` : '/'}
            className={filter.type === type ? 'is-active' : ''}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p>Aucune fiche pour le moment.</p>
      ) : (
        <ul className="items__list">
          {items.map((item) => (
            <li key={item.id}>
              <ItemContent item={item} />
              <p className="items__schedule">
                {(item.cards ?? []).map((card) => scheduleLabel(item, card, now)).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ItemContent({ item }: { item: Item }) {
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
};

function scheduleLabel(item: Item, card: CardSummary, now: Date): string {
  const due = new Date(card.due);
  const when =
    due <= now
      ? card.state === 'New'
        ? 'nouvelle, à réviser'
        : 'à réviser'
      : `dans ${formatDelay(now, due)}`;
  const label = KIND_PREFIX[card.kind] + when;
  return item.type === 'Quote' ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}
