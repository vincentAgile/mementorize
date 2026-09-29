'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, createQuote } from '../../lib/api';

export interface QuoteFormState {
  error?: string;
  text?: string;
  author?: string;
}

export async function createQuoteAction(_previous: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const text = String(formData.get('text') ?? '').trim();
  const author = String(formData.get('author') ?? '').trim();

  if (!text) {
    return { error: 'Le texte de la citation est requis.', text, author };
  }

  try {
    await createQuote({ text, author: author || undefined });
  } catch (error) {
    // Only handle API errors here; anything else (including the redirect
    // thrown when the session has expired) must keep propagating.
    if (error instanceof ApiError) {
      return { error: "Impossible d'enregistrer la citation.", text, author };
    }
    throw error;
  }

  revalidatePath('/'); // re-render the page so the list includes the new quote
  return {};
}
