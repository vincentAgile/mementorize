'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, deleteQuote, updateQuote } from '../../lib/api';
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
