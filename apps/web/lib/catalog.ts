import type { LanguageLevel } from './admin-api';

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
  if (!values.title.trim()) errors.title = 'Saisissez le titre de la liste.';
  else if (values.title.trim().length > CATALOG_MAX.title)
    errors.title = `Le titre fait ${CATALOG_MAX.title} caractères au plus.`;
  if (!isLevel(values.level)) errors.level = 'Choisissez le niveau de la liste.';
  if (values.description.trim().length > CATALOG_MAX.description)
    errors.description = `La description fait ${CATALOG_MAX.description} caractères au plus.`;
  return errors;
}

/** The answers of the API that belong to a field (MEM-116, admin-catalog.service.ts). */
export const API_MESSAGES: Record<string, { field: CatalogField; message: string }> = {
  'Une liste porte déjà ce titre': { field: 'title', message: 'Une liste porte déjà ce titre.' },
  'Une liste vide ne peut pas être publiée': {
    field: 'published',
    message: 'Une liste vide ne peut pas être publiée : ajoutez-lui des mots d’abord.',
  },
};
