'use client';

import { useMemo, useState } from 'react';
import { QUOTE_NOUN } from '../../lib/nouns';
import { matchesQuote, QUOTE_SORTS, type QuoteItem, type QuoteRow, toQuoteRow } from '../../lib/quote-table';
import { distinctValues } from '../../lib/item-list';
import type { LearningStatus } from '../../lib/types';
import { type Column, ItemTable } from '../lists/item-table';
import { QuoteActions, quoteName } from './quote-actions';

/** Beyond this length, the text of a quote is cut in the list, with « Lire la suite ». */
const SHORT = 160;

const COLUMNS: Column<QuoteRow>[] = [
  { key: 'text', label: 'Texte', className: 'item-list__quote', cell: (row) => <QuoteText text={row.text} /> },
  { key: 'author', label: 'Auteur', className: 'item-list__author', cell: (row) => row.author },
  { key: 'source', label: 'Source', className: 'item-list__source', cell: (row) => row.source },
];

const deleteTitle = (count: number) => (count > 1 ? `Supprimer ${count} citations` : 'Supprimer la citation');

interface QuoteTableProps {
  items: QuoteItem[];
  /** The server's clock, so that the server and the browser render the same delays. */
  now: string;
  /** Items per page (MEM-58), the same preference as the vocabulary. */
  pageSize: number;
  /** Opened filtered on a state (?etat=Waiting). */
  initialStatus?: LearningStatus;
}

/**
 * The quotes of the Citations space as a table (MEM-69): the list shared
 * with the vocabulary (ItemTable), with the text, the author and the
 * source, and a single search in all three.
 */
export function QuoteTable({ items, now, pageSize, initialStatus }: QuoteTableProps) {
  const rows = useMemo(() => items.map(toQuoteRow), [items]);
  const authors = useMemo(() => distinctValues(rows.map((row) => row.author)), [rows]);
  return (
    <ItemTable
      type="Quote"
      noun={QUOTE_NOUN}
      label="Mes citations"
      searchLabel="Rechercher dans le texte, l’auteur ou la source"
      rows={rows}
      now={now}
      pageSize={pageSize}
      initialStatus={initialStatus}
      columns={COLUMNS}
      sorts={QUOTE_SORTS}
      matches={matchesQuote}
      name={quoteName}
      queue={false}
      deleteTitle={deleteTitle}
      actions={(row) => <QuoteActions row={row} authors={authors} queue={false} />}
    />
  );
}

/** The start of a long quote, the whole of it in a tooltip, and on demand in the list. */
function QuoteText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= SHORT) return <span className="item-list__main item-list__main--quote">{text}</span>;
  const cut = text.lastIndexOf(' ', SHORT); // between two words
  return (
    <>
      <span className="item-list__main item-list__main--quote" title={open ? undefined : text}>
        {open ? text : `${text.slice(0, cut > 0 ? cut : SHORT)}…`}
      </span>{' '}
      <button type="button" className="link-button item-list__more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Réduire' : 'Lire la suite'}
      </button>
    </>
  );
}
