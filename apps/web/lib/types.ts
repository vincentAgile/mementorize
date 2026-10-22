export type ItemType = 'Quote' | 'Vocabulary' | 'MindMap';
export type CardKind = 'QuoteRecall' | 'EnglishToFrench' | 'FrenchToEnglish' | 'BranchRecall';
export type CardState = 'New' | 'Learning' | 'Review' | 'Relearning';
/** Learning state of an item (MEM-15); only vocabulary leaves `Learning`. */
export type LearningStatus = 'ToLearn' | 'Learning' | 'Learned';
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
  learningStatus: LearningStatus;
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

/** Number of due cards, in all and per type of item (the menu's counters). */
export interface DueSummary {
  total: number;
  byType: Record<ItemType, number>;
}

/** A vocabulary item of a learning session (MEM-21). */
export interface LearningItem {
  id: string;
  word: string;
  translation: string;
  example: string | null;
  /** When the French → English card comes back, for each rating of step 2. */
  nextDue: Record<ReviewRating, string>;
}

export interface LearningSession {
  total: number; // all the items still to learn
  items: LearningItem[]; // up to five, the oldest first
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

export interface ReminderSettingsInput {
  enabled: boolean;
  hour: number; // 0-23, local time
  timeZone: string; // IANA name, e.g. Europe/Paris
}

/** The profile of the user (MEM-11). */
export interface Profile {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** The user's preferences of the web app (MEM-6). */
export interface Preferences {
  homeSpace: ItemType;
}

export interface ReminderSettings extends ReminderSettingsInput {
  emailAvailable: boolean; // false: the server can't send e-mails
}
