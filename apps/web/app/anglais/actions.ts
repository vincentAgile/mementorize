'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, deleteVocabulary, relearnVocabulary, updateVocabulary } from '../../lib/api';

export interface VocabularyEditState {
  saved?: boolean;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: { word: string; translation: string; example: string };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

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
