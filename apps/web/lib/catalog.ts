import type { LanguageLevel } from './types';

/** MEM-116: the levels of a predefined list, on the scale of the CEFR, with their name. */
export const LEVELS: { value: LanguageLevel; label: string }[] = [
  { value: 'A1', label: 'A1 · Débutant' },
  { value: 'A2', label: 'A2 · Élémentaire' },
  { value: 'B1', label: 'B1 · Intermédiaire' },
  { value: 'B2', label: 'B2 · Intermédiaire supérieur' },
  { value: 'C1', label: 'C1 · Autonome' },
  { value: 'C2', label: 'C2 · Maîtrise' },
];

export const levelLabel = (level: LanguageLevel) => LEVELS.find((entry) => entry.value === level)?.label ?? level;

export const isLevel = (value: unknown): value is LanguageLevel => LEVELS.some((entry) => entry.value === value);

export const CATALOG_MAX = { title: 200, description: 500 } as const;

/** What the form of a list holds, as typed. */
export interface CatalogValues {
  title: string;
  level: string;
  description: string;
  published: boolean;
}

export type CatalogField = 'title' | 'level' | 'description' | 'published';

/** The errors of the form, under their field, before anything is sent. */
export function catalogErrors(values: CatalogValues): Partial<Record<CatalogField, string>> {
  const errors: Partial<Record<CatalogField, string>> = {};
  if (!values.title.trim()) errors.title = 'Saisis le titre de la liste.';
  else if (values.title.trim().length > CATALOG_MAX.title)
    errors.title = `Le titre fait ${CATALOG_MAX.title} caractères au plus.`;
  if (!isLevel(values.level)) errors.level = 'Choisis le niveau de la liste.';
  if (values.description.trim().length > CATALOG_MAX.description)
    errors.description = `La description fait ${CATALOG_MAX.description} caractères au plus.`;
  return errors;
}

/** The answers of the API that belong to a field (MEM-116, admin-catalog.service.ts). */
export const API_MESSAGES: Record<string, { field: CatalogField; message: string }> = {
  'Une liste de ce niveau porte déjà ce titre': {
    field: 'title',
    message: 'Une liste de ce niveau porte déjà ce titre : change le titre ou le niveau.',
  },
  'Une liste vide ne peut pas être publiée': {
    field: 'published',
    message: 'Une liste vide ne peut pas être publiée : ajoute-lui des mots d’abord.',
  },
};

// --- MEM-117: the words of a list ---------------------------------------------

/** At most this many words in a list (the API says so too). */
export const MAX_ENTRIES = 500;

/**
 * The fields of a word, named as in the form of the vocabulary of the users
 * (VocabularyFields): `word` is the English, `translation` the French.
 */
export type EntryField = 'word' | 'example' | 'translation' | 'frenchExample' | 'topic';

/** Same limits as the API (CreateCatalogEntryDto), as for a vocabulary item. */
const ENTRY_MAX: Record<EntryField, number> = {
  word: 200,
  translation: 200,
  example: 500,
  frenchExample: 500,
  topic: 50,
};

/** The errors of the form of a word, under their field, before anything is sent: as the « Ajouter » tab. */
export function entryErrors(values: Record<EntryField, string>): Partial<Record<EntryField, string>> {
  const errors: Partial<Record<EntryField, string>> = {};
  if (!values.word) errors.word = 'Saisis le mot, l’expression ou la phrase en anglais.';
  if (!values.translation) errors.translation = 'Saisis la traduction en français.';
  for (const field of Object.keys(ENTRY_MAX) as EntryField[]) {
    if (!errors[field] && values[field].length > ENTRY_MAX[field])
      errors[field] = `${ENTRY_MAX[field]}\u00a0caractères au plus.`;
  }
  return errors;
}

/** The answers of the API about a word (MEM-117, admin-catalog-entries.service.ts). */
export const ENTRY_MESSAGES: Record<string, { field?: EntryField; message: string }> = {
  'Ce mot est déjà dans la liste': { field: 'word', message: 'Cette expression anglaise est déjà dans la liste.' },
  [`Une liste compte ${MAX_ENTRIES} mots au plus`]: {
    message: `La liste compte déjà ${MAX_ENTRIES}\u00a0mots, le maximum : supprimes-en pour en ajouter d’autres.`,
  },
  'Une liste publiée ne peut pas être vidée': {
    message: 'Une liste publiée garde au moins un mot : dépublie-la d’abord pour supprimer tous ses mots.',
  },
  'Le dernier mot d’une liste publiée ne peut pas être supprimé': {
    message: 'C’est le dernier mot de cette liste publiée : dépublie-la d’abord pour le supprimer.',
  },
};

/** « 1 mot », « 1 250 mots ». */
export const wordCount = (count: number) => `${count.toLocaleString('fr-FR')}\u00a0mot${count > 1 ? 's' : ''}`;
