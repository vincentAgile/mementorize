import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalogEntries, getCatalogList } from '../../../../../lib/admin-api';
import { levelLabel, MAX_ENTRIES, wordCount } from '../../../../../lib/catalog';
import { CatalogImport } from './catalog-import';
import { EntriesTable } from './entries-table';
import { EntryForm } from './entry-form';
import { PublishButton } from './publish-button';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await getCatalogList((await params).id);
  return { title: list ? `${list.title} · Catalogue` : 'Catalogue' };
}

/**
 * MEM-116, MEM-117: a predefined list, opened from the catalogue. In its
 * header, its title, level, state and number of words, « Publier » /
 * « Dépublier », the import and the export of its words as CSV; then the
 * form to add a word, at the end of the list, and its words, in its order.
 */
export default async function CatalogListPage({ params }: Props) {
  const { id } = await params;
  const [list, entries] = await Promise.all([getCatalogList(id), getCatalogEntries(id)]);
  if (!list || !entries) notFound();
  const topics = [...new Set(entries.map((entry) => entry.topic).filter((topic): topic is string => !!topic))].sort(
    (a, b) => a.localeCompare(b, 'fr'),
  );
  const full = entries.length >= MAX_ENTRIES;

  return (
    <section className="catalog-list">
      <p className="catalog-list__back">
        <Link href="/admin/catalogue">← Catalogue</Link>
      </p>
      <div className="catalog-list__header">
        <div>
          <h1>{list.title}</h1>
          <p className="catalog-list__meta">
            {levelLabel(list.level)} ·{' '}
            <span className={list.published ? 'catalog__state is-published' : 'catalog__state'}>
              {list.published ? 'Publiée' : 'Brouillon'}
            </span>{' '}
            · {wordCount(entries.length)}
          </p>
          {list.description && <p className="catalog-list__description">{list.description}</p>}
        </div>
        <PublishButton key={`${list.published}-${entries.length}`} listId={list.id} published={list.published} />
      </div>

      <div className="catalog-list__tools">
        <CatalogImport listId={list.id} />
        {entries.length > 0 ? (
          <a className="button--secondary catalog-list__export" href={`/admin/catalogue/${list.id}/export`} download>
            Exporter en CSV
          </a>
        ) : null}
      </div>

      <section className="catalog-list__add" aria-labelledby="entry-add-title">
        <h2 id="entry-add-title">Ajouter un mot</h2>
        {full ? (
          <p className="notice">
            La liste compte {MAX_ENTRIES}&nbsp;mots, le maximum : supprimez-en pour en ajouter d’autres.
          </p>
        ) : (
          <EntryForm listId={list.id} topics={topics} idPrefix="entry-add" />
        )}
      </section>

      <section className="catalog-list__words" aria-labelledby="entries-title">
        <h2 id="entries-title">Mots de la liste</h2>
        <EntriesTable listId={list.id} entries={entries} topics={topics} />
      </section>
    </section>
  );
}
