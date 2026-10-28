import { collator, COMMON_SORTS, type ListRow, normalize, type Sort, type SortSpec } from './item-list';
import { branchesOf, rootOf } from './mind-map';
import type { Item, MindMapContent } from './types';

/**
 * The rows of the table of the mind maps (MEM-98): its columns, how they
 * sort, what the search looks at. The rest is shared with the lists of the
 * other spaces (lib/item-list.ts).
 */

export type MindMapItem = Item & { type: 'MindMap'; content: MindMapContent };

export interface MindMapRow extends ListRow {
  /** The central idea. */
  topic: string;
  branches: number;
  /** Every idea of the map, the central one included. */
  ideas: number;
  /** The branches marked « Appris » (MEM-48). */
  learned: number;
  /** The topic and the labels of the ideas, lower case and without accents. */
  search: string;
}

export function toMindMapRow(item: MindMapItem): MindMapRow {
  const { nodes } = item.content;
  const cards = item.cards ?? [];
  // The next review among the branches still reviewed.
  const dues = cards.filter((card) => !card.learnedAt).map((card) => new Date(card.due).getTime());
  return {
    id: item.id,
    topic: rootOf(nodes)?.label ?? '',
    branches: branchesOf(nodes).length,
    ideas: nodes.length,
    learned: cards.filter((card) => card.learnedAt).length,
    search: normalize(nodes.map((node) => node.label).join(' ')),
    status: item.learningStatus,
    position: null,
    createdAt: new Date(item.createdAt).getTime(),
    nextDue: dues.length > 0 ? Math.min(...dues) : null,
  };
}

/** By default, the most recent first. */
export const DEFAULT_MIND_MAP_SORT: Sort = { key: 'created', direction: 'desc' };

export const MIND_MAP_SORTS: Record<string, SortSpec<MindMapRow>> = {
  topic: { compare: (a, b) => collator.compare(a.topic, b.topic) },
  branches: { compare: (a, b) => a.branches - b.branches },
  ideas: { compare: (a, b) => a.ideas - b.ideas },
  learned: { compare: (a, b) => a.learned - b.learned },
  review: COMMON_SORTS.review,
  created: { compare: (a, b) => a.createdAt - b.createdAt },
};

/** The search looks in the topic and the labels of the ideas. */
export const matchesMindMap = (row: MindMapRow, needle: string) => !needle || row.search.includes(needle);
