'use client';

import { QUOTE_NOUN } from '../../lib/nouns';
import { matchesQuote, QUOTE_SORTS, type QuoteRow } from '../../lib/quote-table';
import { type PickKind, PickTable } from '../lists/pick-table';
import { quoteName } from './quote-actions';
import { QUOTE_COLUMNS } from './quote-table';

const QUOTES: PickKind<QuoteRow> = {
  type: 'Quote',
  noun: QUOTE_NOUN,
  columns: QUOTE_COLUMNS,
  sorts: QUOTE_SORTS,
  matches: matchesQuote,
  searchLabel: 'Rechercher dans le texte, l’auteur ou la source',
  name: quoteName,
};

/** The quotes to add to a learning session (the selection page of the Citations space), as for the vocabulary (MEM-95). */
export function QuotePickTable(props: {
  rows: QuoteRow[];
  list: string[];
  room: number;
  prepareHref: string;
  pageSize: number;
}) {
  return <PickTable kind={QUOTES} {...props} />;
}
