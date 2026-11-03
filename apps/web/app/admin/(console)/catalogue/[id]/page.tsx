import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalogList } from '../../../../../lib/admin-api';
import { levelLabel } from '../../../../../lib/catalog';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await getCatalogList((await params).id);
  return { title: list ? `${list.title} · Catalogue` : 'Catalogue' };
}

/**
 * MEM-116: a predefined list, opened from the catalogue. Its words come with
 * the next story (their entry and import); meanwhile, its title.
 */
export default async function CatalogListPage({ params }: Props) {
  const list = await getCatalogList((await params).id);
  if (!list) notFound();
  return (
    <section className="catalog-list">
      <p className="catalog-list__back">
        <Link href="/admin/catalogue">← Catalogue</Link>
      </p>
      <h1>{list.title}</h1>
      <p className="catalog-list__meta">
        {levelLabel(list.level)} · {list.published ? 'Publiée' : 'Brouillon'}
      </p>
      {list.description && <p className="catalog-list__description">{list.description}</p>}
      <p className="admin__empty">Aucun mot pour le moment.</p>
    </section>
  );
}
