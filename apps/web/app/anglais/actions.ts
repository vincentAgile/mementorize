'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createVocabulary,
  deleteVocabulary,
  deleteVocabularyItems,
  queueVocabularyItems,
  relearnVocabulary,
  savePreferences,
  updateVocabulary,
} from '../../lib/api';

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
   * each time. Its topic stays in the form, for the next items (MEM-51), and
   * so does the choice of the learning queue (MEM-62); `position` is its
   * place in the queue, null when it is "En attente".
   */
  added?: { word: string; topic: string; queue: boolean; position: number | null };
  /** Sent back with an error, with `values`: the choice of the learning queue (MEM-62). */
  queue?: boolean;
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
  // MEM-62: the checkbox "Ajouter à la file d'apprentissage" (checked by default).
  const queue = formData.get('queue') === 'on';
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
    return { values, fieldErrors, queue };
  }

  let created;
  try {
    created = await createVocabulary({
      word: values.word,
      translation: values.translation,
      example: values.example || undefined,
      frenchExample: values.frenchExample || undefined,
      topic: values.topic || undefined,
      queue,
    });
  } catch (error) {
    if (error instanceof ApiError) return { values, queue, error: 'Impossible d’enregistrer l’élément. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the counter of the "Apprendre · Réviser" tab, the list
  return { added: { word: values.word, topic: values.topic, queue, position: created.learnPosition } };
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

/**
 * MEM-58: the number of items per page of the list, kept with the account's
 * preferences. No revalidatePath: the table already shows the new size.
 */
export async function savePageSizeAction(size: number): Promise<void> {
  if (![20, 50, 100].includes(size)) throw new Error('Invalid page size');
  try {
    await savePreferences({ vocabularyPageSize: size });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error; // the table works without it
  }
}

/**
 * MEM-59: deletes the selected items, with their cards and history, in a
 * single request. Returns how many were deleted, or null when it failed.
 */
export async function deleteVocabularyItemsAction(ids: string[]): Promise<number | null> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 10_000 || ids.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid selection');
  }
  let deleted: number;
  try {
    deleted = await deleteVocabularyItems(ids);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counters, the review
  return deleted;
}

/**
 * MEM-63: puts the items "En attente" among `ids` in the learning queue
 * (last, in the order of the list), or takes those of the queue out of it.
 * The others are ignored. Null when it failed.
 */
export async function queueItemsAction(
  op: 'add' | 'remove',
  ids: string[],
): Promise<{ changed: number; ignored: number } | null> {
  if (
    (op !== 'add' && op !== 'remove') ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 10_000 ||
    ids.some((id) => typeof id !== 'string')
  ) {
    throw new Error('Invalid queue change');
  }
  let result: { changed: number; ignored: number };
  try {
    result = await queueVocabularyItems(op, ids);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counter of "Apprendre"
  return result;
}

/** MEM-63: the same, for one row (a form's action). */
export async function queueRowAction(op: 'add' | 'remove', id: string): Promise<void> {
  await queueItemsAction(op, [id]);
}
