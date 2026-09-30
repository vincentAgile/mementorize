export type ItemType = 'Quote' | 'Vocabulary' | 'MindMap';
export type CardKind = 'QuoteRecall' | 'EnglishToFrench' | 'FrenchToEnglish' | 'BranchRecall';
export type CardState = 'New' | 'Learning' | 'Review' | 'Relearning';
export type ReviewRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface QuoteContent {
  text: string;
  author: string | null;
  source: string | null;
}

export interface VocabularyContent {
  word: string;
  translation: string;
  example: string | null;
}

/** A node of a mind map, as stored by the API (each node knows its parent). */
export interface MindMapNode {
  id: string;
  parentId: string | null; // null for the root only
  label: string;
  position: { x: number; y: number };
}

export interface MindMapContent {
  nodes: MindMapNode[];
}

export interface CardSummary {
  id: string;
  kind: CardKind;
  nodeId: string | null; // mind maps: the branch this card asks about
  due: string;
  state: CardState;
}

interface ItemBase {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  cards?: CardSummary[]; // included by GET /items
}

/**
 * Discriminated union: checking `item.type` tells TypeScript which shape
 * `item.content` has (same idea as the jsonb column on the API side).
 */
export type Item =
  | (ItemBase & { type: 'Quote'; content: QuoteContent })
  | (ItemBase & { type: 'Vocabulary'; content: VocabularyContent })
  | (ItemBase & { type: 'MindMap'; content: MindMapContent });

export interface CreateQuoteInput {
  text: string;
  author?: string;
  source?: string;
}

export interface CreateVocabularyInput {
  word: string;
  translation: string;
  example?: string;
}

/** A mind map as returned by /mind-maps (title = label of the root). */
export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  cards: { id: string; nodeId: string; due: string; state: CardState }[];
}

/** A card waiting to be reviewed, as returned by GET /reviews/due. */
export interface DueItem {
  item: Item;
  card: {
    id: string;
    kind: CardKind;
    nodeId: string | null;
    due: string;
    state: CardState;
    reps: number;
    lapses: number;
  };
  nextDue: Record<ReviewRating, string>; // ISO dates
}

export interface DueReviews {
  total: number;
  items: DueItem[];
  nextDueAt: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}
