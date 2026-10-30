import type { Metadata } from 'next';
import Link from 'next/link';
import { getItems, getPreferences } from '../../../../lib/api';
import { type QuoteItem, toQuoteRow } from '../../../../lib/quote-table';
import { candidatesOf, listOf, MAX_SESSION_SIZE, withList } from '../../../../lib/session-preparation';
import { QuotePickTable } from '../../pick-table';

export const metadata: Metadata = { title: 'Ajouter à la session · Citations' };

const PREPARE = '/citations/preparer';

/**
 * The selection of the quotes to add to the learning session being prepared
 * (?liste=, its composition), as in the Anglais space (MEM-95): those « À
 * apprendre » and « En attente » that are not in it yet.
 */
export default async function QuotePickPage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  const { liste } = await searchParams;
  const [all, { vocabularyPageSize }] = await Promise.all([getItems('Quote'), getPreferences()]);
  const items = all as QuoteItem[];
  const list = (listOf(liste ?? '', candidatesOf(items)) ?? []).map((candidate) => candidate.id);
  const room = MAX_SESSION_SIZE - list.length;
  const inList = new Set(list);
  const rows = items
    .filter((item) => (item.learningStatus === 'ToLearn' || item.learningStatus === 'Waiting') && !inList.has(item.id))
    .map(toQuoteRow);

  if (room <= 0 || rows.length === 0) {
    return (
      <section className="learn-review__empty">
        <h2 className="prepare__title">Ajouter des citations à la session</h2>
        <p>
          {room <= 0
            ? `${MAX_SESSION_SIZE} citations au plus par session : retirez-en une pour en ajouter une autre.`
            : 'Toutes les citations à apprendre ou en attente sont déjà dans la session.'}
        </p>
        <Link href={withList(PREPARE, list)} className="prepare__cancel">
          Retour à la préparation
        </Link>
      </section>
    );
  }
  return <QuotePickTable rows={rows} list={list} room={room} prepareHref={PREPARE} pageSize={vocabularyPageSize} />;
}
