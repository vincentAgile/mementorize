'use server';

import { revalidatePath } from 'next/cache';
import { markVocabularyLearned, submitReview } from '../../lib/api';
import type { ReviewRating } from '../../lib/types';

const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

// A Server Action is a public HTTP endpoint in disguise: anyone can call it
// with any arguments, so they are validated even though our own buttons
// only ever send valid values.
export async function reviewAction(cardId: string, rating: ReviewRating): Promise<void> {
  if (typeof cardId !== 'string' || !RATINGS.includes(rating)) {
    throw new Error('Invalid review');
  }
  await submitReview(cardId, rating);
  revalidatePath('/review'); // show the next due card
  revalidatePath('/', 'layout'); // due counter in the header, schedules in the spaces
}

/** "Appris" (MEM-22): the vocabulary item and its two cards leave the review. */
export async function learnedAction(itemId: string): Promise<void> {
  if (typeof itemId !== 'string') {
    throw new Error('Invalid item');
  }
  await markVocabularyLearned(itemId);
  revalidatePath('/review'); // show the next due card
  revalidatePath('/', 'layout'); // counters, and the state in the Anglais table
}
