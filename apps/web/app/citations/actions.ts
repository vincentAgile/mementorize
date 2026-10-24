'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, createQuote, deleteQuote, updateQuote } from '../../lib/api';
import { QUOTE_MAX, type QuoteField, type QuoteValues } from './quote-fields';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

const valuesOf = (formData: FormData): QuoteValues => ({
  text: field(formData, 'text'),
  author: field(formData, 'author'),
  source: field(formData, 'source'),
});

/** The text is required; each field has the length limit of the API. One message per field. */
function errorsOf(values: QuoteValues): Partial<Record<QuoteField, string>> {
  const errors: Partial<Record<QuoteField, string>> = {};
  if (!values.text) errors.text = 'Saisis le texte de la citation.';
  for (const name of Object.keys(QUOTE_MAX) as QuoteField[]) {
    if (values[name].length > QUOTE_MAX[name]) errors[name] = `${QUOTE_MAX[name]} caractères au plus.`;
  }
  return errors;
}

export interface QuoteAddState {
  /**
   * The quote just added, for the confirmation; a new object each time. Its
   * author and source stay in the form, for the next quotes of the same
   * author or work, and so does the choice of the learning queue;
   * `position` is its place in the queue, null when it is "En attente".
   */
  added?: { text: string; author: string; source: string; queue: boolean; position: number | null };
  /** Sent back with an error, with `values`: the choice of the learning queue. */
  queue?: boolean;
  /** One message per field, shown next to it. */
  fieldErrors?: Partial<Record<QuoteField, string>>;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: QuoteValues;
}

/**
 * MEM-71: adds a quote from the "Ajouter" tab, last in the learning queue
 * of the quotes, or "En attente" when the box is unchecked. Errors come back
 * field by field.
 */
export async function addQuoteAction(_previous: QuoteAddState, formData: FormData): Promise<QuoteAddState> {
  const values = valuesOf(formData);
  const queue = formData.get('queue') === 'on'; // « Ajouter à la file d'apprentissage », checked by default
  const fieldErrors = errorsOf(values);
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors, queue };

  let created;
  try {
    created = await createQuote({
      text: values.text,
      author: values.author || undefined,
      source: values.source || undefined,
      queue,
    });
  } catch (error) {
    if (error instanceof ApiError) return { values, queue, error: 'Impossible d’enregistrer la citation. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the counter of "Apprendre · Réviser", the list
  return { added: { ...values, queue, position: created.learnPosition } };
}

export interface QuoteEditState {
  saved?: boolean;
  fieldErrors?: Partial<Record<QuoteField, string>>;
  error?: string;
  /** Sent back with an error: React resets the form after an action, this refills it. */
  values?: QuoteValues;
}

/**
 * MEM-69: changes the text, the author or the source of a quote; its state
 * and its review history stay as they are. An empty author or source
 * removes it.
 */
export async function updateQuoteAction(
  id: string,
  _previous: QuoteEditState,
  formData: FormData,
): Promise<QuoteEditState> {
  const values = valuesOf(formData);
  const fieldErrors = errorsOf(values);
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  try {
    await updateQuote(id, values);
  } catch (error) {
    if (error instanceof ApiError) return { values, error: 'Impossible d’enregistrer la modification.' };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/', 'layout'); // the list, the review
  return { saved: true };
}

/** MEM-69: the quote, its card and its history are gone for good. */
export async function deleteQuoteAction(id: string): Promise<void> {
  if (typeof id !== 'string') throw new Error('Invalid quote');
  await deleteQuote(id);
  revalidatePath('/', 'layout'); // the list, the review and every counter
}
