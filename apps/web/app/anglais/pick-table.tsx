'use client';

import { ITEM_NOUN } from '../../lib/nouns';
import { matchesVocabulary, topicsOf, VOCABULARY_SORTS, type VocabularyRow } from '../../lib/vocabulary-table';
import { type PickKind, PickTable } from '../lists/pick-table';
import { VOCABULARY_COLUMNS } from './vocabulary-table';

const VOCABULARY: PickKind<VocabularyRow> = {
  type: 'Vocabulary',
  noun: ITEM_NOUN,
  columns: VOCABULARY_COLUMNS,
  sorts: VOCABULARY_SORTS,
  matches: matchesVocabulary,
  searchLabel: 'Rechercher en anglais ou en français',
  name: (row) => row.english,
  topicsOf: (rows) => topicsOf(rows.map((row) => row.topic)), // MEM-56
};

/** MEM-95: the vocabulary to add to a learning session (the selection page of the Anglais space). */
export function VocabularyPickTable(props: {
  rows: VocabularyRow[];
  list: string[];
  room: number;
  prepareHref: string;
  pageSize: number;
}) {
  return <PickTable kind={VOCABULARY} {...props} />;
}
