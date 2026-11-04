import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalogList } from '../../../../../lib/api';
import { LevelBadge } from '../level-badge';
import { ListContent } from './list-content';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await getCatalogList((await params).id);
  return { title: list ? `${list.title} · Ajouter une liste` : 'Ajouter une liste · Anglais' };
}

/**
 * MEM-118: the content of a predefined list, before adding its words: its
 * title, level and description, then its words to choose (ListContent). A
 * draft, or a list withdrawn, is unknown here (404).
 */
export default async function PredefinedListPage({ params }: Props) {
  const list = await getCatalogList((await params).id);
  if (!list) notFound();
  return (
    <section className="catalog-detail" aria-labelledby="catalog-detail-title">
      <p className="catalog-detail__back">
        <Link href="/anglais/ajouter-liste/predefinies">← Retour aux listes</Link>
      </p>
      <LevelBadge level={list.level} />
      <h2 id="catalog-detail-title" className="catalog-detail__title">
        {list.title}
      </h2>
      {list.description && <p className="catalog-detail__description">{list.description}</p>}
      <ListContent list={list} />
    </section>
  );
}
