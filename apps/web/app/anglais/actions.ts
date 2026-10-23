'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, createVocabulary, deleteVocabulary, relearnVocabulary, updateVocabulary } from '../../lib/api';

export interface VocabularyEditState {
  saved?: boolean;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: { word: string; translation: string; example: string; frenchExample: string; topic: string };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

// Same limits as the API (CreateVocabularyDto).
const MAX = { word: 200, translation: 200, example: 500, frenchExample: 500, topic: 50 } as const;

export interface VocabularyAddState {
  /**
   * The English of the item just added, for the confirmation; a new object
   * each time. Its topic stays in the form, for the next items (MEM-51).
   */
  added?: { word: string; topic: string };
  /** One message per field, shown next to it. */
  fieldErrors?: Partial<Record<'word' | 'translation' | 'example' | 'frenchExample' | 'topic', string>>;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: { word: string; translation: string; example: string; frenchExample: string; topic: string };
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
    frenchExample: field(formData, 'frenchExample'),
    topic: field(formData, 'topic'),
  };
  const fieldErrors: VocabularyAddState['fieldErrors'] = {};
  if (!values.word) fieldErrors.word = 'Saisis le mot, l’expression ou la phrase en anglais.';
  else if (values.word.length > MAX.word) fieldErrors.word = `${MAX.word}\u00a0caractères au plus.`;
  if (!values.translation) fieldErrors.translation = 'Saisis la traduction en français.';
  else if (values.translation.length > MAX.translation)
    fieldErrors.translation = `${MAX.translation}\u00a0caractères au plus.`;
  if (values.example.length > MAX.example) fieldErrors.example = `${MAX.example}\u00a0caractères au plus.`;
  if (values.frenchExample.length > MAX.frenchExample)
    fieldErrors.frenchExample = `${MAX.frenchExample}\u00a0caractères au plus.`;
  if (values.topic.length > MAX.topic) fieldErrors.topic = `${MAX.topic}\u00a0caractères au plus.`;
  if (Object.keys(fieldErrors).length > 0) {
    return { values, fieldErrors };
  }

  try {
    await createVocabulary({
      word: values.word,
      translation: values.translation,
      example: values.example || undefined,
      frenchExample: values.frenchExample || undefined,
      topic: values.topic || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) return { values, error: 'Impossible d’enregistrer l’élément. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the counter of the "Apprendre · Réviser" tab, the list
  return { added: { word: values.word, topic: values.topic } };
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
  const frenchExample = field(formData, 'frenchExample');
  const topic = field(formData, 'topic');
  const values = { word, translation, example, frenchExample, topic };
  if (!word || !translation) {
    return { values, error: 'L’anglais et le français sont requis.' };
  }
  if (topic.length > MAX.topic) {
    return { values, error: `La thématique fait ${MAX.topic}\u00a0caractères au plus.` };
  }

  try {
    // An empty example or topic is sent as such: the API removes it.
    await updateVocabulary(id, { word, translation, example, frenchExample, topic });
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
