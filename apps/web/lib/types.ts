export type ItemType = 'Quote' | 'Vocabulary' | 'MindMap';
/** The spaces with a list, a learning queue and CSV files: the vocabulary and the quotes (v0.12). */
export type ListType = 'Vocabulary' | 'Quote';
export type CardKind = 'QuoteRecall' | 'EnglishToFrench' | 'FrenchToEnglish' | 'BranchRecall';
export type CardState = 'New' | 'Learning' | 'Review' | 'Relearning';
/** Learning state of an item (MEM-15): vocabulary and quotes (MEM-67); mind maps are always `Learning`. */
export type LearningStatus = 'Waiting' | 'ToLearn' | 'Learning' | 'Learned'; // Waiting: MEM-61
export type ReviewRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface QuoteContent {
  text: string;
  author: string | null;
  source: string | null;
}

export interface VocabularyContent {
  word: string;
  translation: string;
  example: string | null; // in English
  /** In French (MEM-42); absent from the items created before it. */
  frenchExample?: string | null;
  /** The topic of the pair (MEM-51): "Voyage", "Cuisine"…; absent before it. */
  topic?: string | null;
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
  learnedAt?: string | null; // mind map branches marked « Appris » (MEM-48)
}

interface ItemBase {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  learningStatus: LearningStatus;
  learnPosition?: number | null; // MEM-61: position in the learning queue ("À apprendre")
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
  queue?: boolean; // MEM-71: false, the quote is "En attente" (true by default)
}

export interface CreateVocabularyInput {
  word: string;
  translation: string;
  example?: string;
  frenchExample?: string; // MEM-42
  topic?: string; // MEM-51
  queue?: boolean; // MEM-62: false, the item is "En attente" (true by default)
}

/** A mind map as returned by /mind-maps (title = label of the root). */
export interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  cards: { id: string; nodeId: string; due: string; state: CardState; learnedAt?: string | null }[];
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
  cardId: string; // its French → English card, reviewed directly when it comes back (MEM-47)
  word: string;
  translation: string;
  example: string | null;
  frenchExample?: string | null; // MEM-42
  /** When the French → English card comes back, for each rating of step 2. */
  nextDue: Record<ReviewRating, string>;
  /** The same once rated « À revoir »: the answers are only sent at the end of the session. */
  nextDueAfterAgain: Record<ReviewRating, string>;
}

export interface LearningSession {
  total: number; // all the items still to learn
  items: LearningItem[]; // up to five, the first ones of the learning queue
}

/** A quote of a learning session (MEM-68): learned in a single step, as it is reviewed. */
export interface QuoteLearningItem {
  id: string;
  cardId: string; // reviewed directly when it comes back in the session (MEM-47)
  text: string;
  author: string | null;
  source: string | null;
  /** When the card comes back, for each rating. */
  nextDue: Record<ReviewRating, string>;
  /** The same once rated « À revoir »: the answers are only sent at the end of the session. */
  nextDueAfterAgain: Record<ReviewRating, string>;
}

export interface QuoteLearningSession {
  total: number; // all the quotes still to learn
  items: QuoteLearningItem[]; // up to five, the first ones of their learning queue
}

/** Answer of POST /reviews/:cardId and POST /learning/:itemId: when the card comes back next time. */
export interface RatedCard {
  nextDueByRating: Record<ReviewRating, string>;
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

/** The services of the translate buttons (MEM-44). */
export type Translator = 'DeepL' | 'Google';

/** The user's preferences of the web app (MEM-6, MEM-44). */
export interface Preferences {
  homeSpace: ItemType;
  translator: Translator;
  showReviewDelays: boolean; // MEM-49: the delays under the rating buttons
  csvSeparator: CsvSeparator; // MEM-55
  vocabularyPageSize: number; // MEM-58: 20, 50 or 100
}

/** The separator of the CSV files, export and import (MEM-55). */
export type CsvSeparator = 'Semicolon' | 'Comma';

export interface ReminderSettings extends ReminderSettingsInput {
  emailAvailable: boolean; // false: the server can't send e-mails
}

/** A line of a CSV file to import, and what importing it would do (MEM-53). */
export type ImportRow = {
  line: number;
  french: string;
  english: string;
  topic: string;
  frenchExample: string;
  example: string;
} & (
  | { status: 'new' }
  | { status: 'duplicate'; languages: ('en' | 'fr')[]; of: { existing: string } | { line: number } }
  | { status: 'error'; error: string }
);

/** Answer of POST /vocabulary-csv/preview: the lines, or why the file can't be read. */
export type ImportAnalysis =
  | { ok: true; rows: ImportRow[]; summary: { total: number; new: number; duplicate: number; error: number } }
  | { ok: false; problem: 'empty' | 'tooManyLines' | 'syntax' | 'wrongSeparator'; line?: number };

/** Answer of POST /vocabulary-csv/import (MEM-54). */
export type ImportResult =
  { ok: true; imported: number; duplicate: number; error: number } | Extract<ImportAnalysis, { ok: false }>;
