'use server';

import { revalidatePath } from 'next/cache';
import { submitReview } from '../../lib/api';
import type { ReviewRating } from '../../lib/types';

const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

// A Server Action is a public HTTP endpoint in disguise: anyone can call it
// with any arguments, so they are validated even though our own buttons
// only ever send valid values.
export async function reviewAction(quoteId: string, rating: ReviewRating): Promise<void> {
  if (typeof quoteId !== 'string' || !RATINGS.includes(rating)) {
    throw new Error('Invalid review');
  }
  await submitReview(quoteId, rating);
  revalidatePath('/review'); // show the next due card
  revalidatePath('/'); // due counter and schedules on the home page
}
