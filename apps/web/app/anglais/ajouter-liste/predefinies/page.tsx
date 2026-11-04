import type { Metadata } from 'next';
import Link from 'next/link';
import { getCatalogLists } from '../../../../lib/api';
import { isLevel, LEVELS } from '../../../../lib/catalog';
import { BackToChoice } from '../back-to-choice';
import { ListCard } from './list-card';

export const metadata: Metadata = { title: 'Liste prédéfinie · Ajouter une liste' };

/**
 * « Liste prédéfinie », a choice of « Ajouter une liste » (MEM-123; before,
 * the tab « Listes prédéfinies », MEM-118): the lists
 * published in the console, as cards, by level then by title, with a filter
 * by level in the address (?niveau=A2: bookmarks and the Back button work).
 * Each level says how many lists it has; a level without any is off.
 */
export default async function PredefinedListsPage({ searchParams }: { searchParams: Promise<{ niveau?: string }> }) {
  const { niveau } = await searchParams;
  const level = isLevel(niveau) ? niveau : null;
  const lists = await getCatalogLists();
  const shown = level ? lists.filter((list) => list.level === level) : lists;
  const count = (value: string) => lists.filter((list) => list.level === value).length;

  return (
    <section className="catalog-lists" aria-labelledby="catalog-lists-title">
      <BackToChoice />
      <h2 id="catalog-lists-title" className="add-list__title">
        Liste prédéfinie
      </h2>
      <p className="catalog-lists__intro">
        Des listes de mots et d’expressions par niveau, à ajouter à ton vocabulaire en un clic : tu choisis lesquels.
      </p>
      <nav className="level-filter" aria-label="Filtrer par niveau">
        <Chip href="/anglais/ajouter-liste/predefinies" active={!level} label="Tous" count={lists.length} />
        {LEVELS.map(({ value, label }) => (
          <Chip
            key={value}
            href={`/anglais/ajouter-liste/predefinies?niveau=${value}`}
            active={level === value}
            label={value}
            title={label}
            count={count(value)}
          />
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="catalog-lists__empty">
          {level ? `Aucune liste de niveau ${level} pour le moment.` : 'Aucune liste prédéfinie pour le moment.'}
        </p>
      ) : (
        <div className="catalog-lists__grid">
          {shown.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A level of the filter, with its number of lists: a link, or off when it has none. */
function Chip({
  href,
  active,
  label,
  title,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  title?: string;
  count: number;
}) {
  const name = `${title ?? label}, ${count}\u00a0liste${count > 1 ? 's' : ''}`;
  const content = (
    <>
      {label} <span className="level-filter__count">{count}</span>
    </>
  );
  if (count === 0 && !active) {
    return (
      <span className="level-filter__chip is-disabled" aria-disabled="true" title={title} aria-label={name}>
        {content}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={active ? 'level-filter__chip is-active' : 'level-filter__chip'}
      aria-current={active ? 'true' : undefined}
      title={title}
      aria-label={name}
      scroll={false}
    >
      {content}
    </Link>
  );
}
