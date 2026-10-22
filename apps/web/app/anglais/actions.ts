'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, createVocabulary, deleteVocabulary, relearnVocabulary, updateVocabulary } from '../../lib/api';

export interface VocabularyEditState {
  saved?: boolean;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: { word: string; translation: string; example: string };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

// Same limits as the API (CreateVocabularyDto).
const MAX = { word: 200, translation: 200, example: 500 } as const;

export interface VocabularyAddState {
  /** The English of the item just added, for the confirmation; a new object each time. */
  added?: { word: string };
  /** One message per field, shown next to it. */
  fieldErrors?: Partial<Record<'word' | 'translation' | 'example', string>>;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: { word: string; translation: string; example: string };
}

/**
 * MEM-27: adds a vocabulary item from the "Ajouter" tab. It enters the
 * state "À apprendre" (MEM-15). Errors come back field by field.
 */
export async function addVocabularyAction(
  _previous: VocabularyAddState,
  formData: FormData,
): Promise<VocabularyAddState> {
  const values = {
    word: field(formData, 'word'),
    translation: field(formData, 'translation'),
    example: field(formData, 'example'),
  };
  const fieldErrors: VocabularyAddState['fieldErrors'] = {};
  if (!values.word) fieldErrors.word = 'Saisis le mot, l’expression ou la phrase en anglais.';
  else if (values.word.length > MAX.word) fieldErrors.word = `${MAX.word} caractères au plus.`;
  if (!values.translation) fieldErrors.translation = 'Saisis la traduction en français.';
  else if (values.translation.length > MAX.translation)
    fieldErrors.translation = `${MAX.translation} caractères au plus.`;
  if (values.example.length > MAX.example) fieldErrors.example = `${MAX.example} caractères au plus.`;
  if (Object.keys(fieldErrors).length > 0) {
    return { values, fieldErrors };
  }

  try {
    await createVocabulary({
      word: values.word,
      translation: values.translation,
      example: values.example || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) return { values, error: 'Impossible d’enregistrer l’élément. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the counter of the "Apprendre · Réviser" tab, the list
  return { added: { word: values.word } };
}

/** MEM-19: same rules as when adding a word (both sides required, same lengths as the API). */
export async function updateVocabularyAction(
  id: string,
  _previous: VocabularyEditState,
  formData: FormData,
): Promise<VocabularyEditState> {
  const word = field(formData, 'word');
  const translation = field(formData, 'translation');
  const example = field(formData, 'example');
  const values = { word, translation, example };
  if (!word || !translation) {
    return { values, error: 'L’anglais et le français sont requis.' };
  }

  try {
    // An empty example is sent as such: the API removes it.
    await updateVocabulary(id, { word, translation, example });
  } catch (error) {
    if (error instanceof ApiError) return { values, error: 'Impossible d’enregistrer la modification.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the table, and the counters if needed
  return { saved: true };
}

/** MEM-20: the item, its cards and their history are gone for good. */
export async function deleteVocabularyAction(id: string): Promise<void> {
  await deleteVocabulary(id);
  revalidatePath('/', 'layout'); // the table, the review and every counter
}

/** MEM-22: a learned item goes back to the review, with the schedule it had. */
export async function relearnAction(id: string): Promise<void> {
  await relearnVocabulary(id);
  revalidatePath('/', 'layout'); // the table and the counters
}
