import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../../lib/api';
import { candidatesOf, listOf, MAX_SESSION_SIZE, withList } from '../../../../lib/session-preparation';
import { toRow, type VocabularyItem } from '../../../../lib/vocabulary-table';
import { PickTable } from '../../pick-table';

export const metadata: Metadata = { title: 'Ajouter à la session · Anglais' };

const PREPARE = '/anglais/preparer';

/**
 * MEM-95: the selection of the items to add to the learning session being
 * prepared (?liste=, its composition): those « À apprendre » and « En
 * attente » that are not in it yet.
 */
export default async function PickPage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  const { liste } = await searchParams;
  const [all, { vocabularyPageSize }] = await Promise.all([getItems('Vocabulary'), getPreferences()]);
  const items = all as VocabularyItem[];
  const list = (listOf(liste ?? '', candidatesOf(items)) ?? []).map((candidate) => candidate.id);
  const room = MAX_SESSION_SIZE - list.length;
  const inList = new Set(list);
  const rows = items
    .filter((item) => (item.learningStatus === 'ToLearn' || item.learningStatus === 'Waiting') && !inList.has(item.id))
    .map(toRow);

  if (room <= 0 || rows.length === 0) {
    return (
      <section className="learn-review__empty">
        <h2 className="prepare__title">Ajouter des éléments à la session</h2>
        <p>
          {room <= 0
            ? `${MAX_SESSION_SIZE} éléments au plus par session : retirez-en un pour en ajouter un autre.`
            : 'Tous les éléments à apprendre ou en attente sont déjà dans la session.'}
        </p>
        <Link href={withList(PREPARE, list)} className="prepare__cancel">
          Retour à la préparation
        </Link>
      </section>
    );
  }
  return <PickTable rows={rows} list={list} room={room} prepareHref={PREPARE} pageSize={vocabularyPageSize} />;
}
