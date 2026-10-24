'use client';

import { useMemo } from 'react';
import { ITEM_NOUN } from '../../lib/nouns';
import type { LearningStatus, Translator } from '../../lib/types';
import {
  matchesVocabulary,
  toRow,
  topicsOf,
  VOCABULARY_SORTS,
  type VocabularyItem,
  type VocabularyRow,
} from '../../lib/vocabulary-table';
import { type Column, ItemTable } from '../lists/item-table';
import { VocabularyActions } from './vocabulary-actions';

const COLUMNS: Column<VocabularyRow>[] = [
  {
    key: 'english',
    label: 'Anglais',
    cell: (row) => (
      <>
        <span lang="en" className="item-list__main">
          {row.english}
        </span>
        {row.example && (
          <span lang="en" className="item-list__example">
            {row.example}
          </span>
        )}
      </>
    ),
  },
  {
    key: 'french',
    label: 'Français',
    cell: (row) => (
      <>
        {row.french}
        {row.frenchExample && (
          <span lang="fr" className="item-list__example">
            {row.frenchExample}
          </span>
        )}
      </>
    ),
  },
  { key: 'topic', label: 'Thématique', className: 'item-list__topic', cell: (row) => row.topic },
];

const english = (row: VocabularyRow) => row.english;
const deleteTitle = (count: number) =>
  count > 1 ? `Supprimer ${count} éléments de vocabulaire` : 'Supprimer l’élément de vocabulaire';

interface VocabularyTableProps {
  items: VocabularyItem[];
  /** The server's clock, so that the server and the browser render the same delays. */
  now: string;
  /** The service of the translate buttons of the edit form (MEM-44). */
  translator: Translator;
  /** Items per page (MEM-58), from the account's preferences. */
  pageSize: number;
  /** Opened filtered on a state (?etat=Waiting, MEM-61). */
  initialStatus?: LearningStatus;
}

/**
 * The vocabulary of the Anglais space as a table (MEM-16): the list shared
 * with the quotes (ItemTable), with the columns of the vocabulary, its
 * topic filter (MEM-56) and its learning queue (MEM-63, MEM-64).
 */
export function VocabularyTable({ items, now, translator, pageSize, initialStatus }: VocabularyTableProps) {
  const rows = useMemo(() => items.map(toRow), [items]);
  const topics = useMemo(() => topicsOf(rows.map((row) => row.topic)), [rows]); // MEM-51
  return (
    <ItemTable
      type="Vocabulary"
      noun={ITEM_NOUN}
      label="Mon vocabulaire"
      searchLabel="Rechercher en anglais ou en français"
      rows={rows}
      now={now}
      pageSize={pageSize}
      initialStatus={initialStatus}
      columns={COLUMNS}
      sorts={VOCABULARY_SORTS}
      matches={matchesVocabulary}
      topics={topics}
      name={english}
      queue
      deleteTitle={deleteTitle}
      actions={(row, queueMenu) => (
        <VocabularyActions row={row} translator={translator} topics={topics} queueMenu={queueMenu} />
      )}
    />
  );
}
