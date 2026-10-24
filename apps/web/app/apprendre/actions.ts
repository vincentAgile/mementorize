'use server';

import { ApiError, learnItem, markItemLearned } from '../../lib/api';
import type { ReviewRating } from '../../lib/types';

const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

/**
 * Step 2 of a learning session (MEM-21), or the rating of a quote (MEM-68):
 * records the rating, the item moves to "En cours d'apprentissage". Returns when its card comes back for each
 * rating (MEM-47: after « À revoir », at the end of the session), or null
 * when the API refused it (the item was learned in another tab, or deleted
 * meanwhile).
 */
export async function learnAction(itemId: string, rating: ReviewRating): Promise<Record<ReviewRating, string> | null> {
  // A Server Action is a public endpoint: its arguments are checked.
  if (typeof itemId !== 'string' || !RATINGS.includes(rating)) {
    throw new Error('Invalid rating');
  }
  let nextDue: Record<ReviewRating, string>;
  try {
    nextDue = (await learnItem(itemId, rating)).nextDueByRating;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error; // e.g. the redirect of an expired session
  }
  // No revalidatePath here, on purpose: it would render /apprendre again, and
  // after the last rating the page would find nothing left to learn and
  // replace the summary of the session. The pages are dynamic (rendered on
  // each visit, the client cache keeps them 0 s): the counters are up to
  // date as soon as the user leaves the session.
  return nextDue;
}

/**
 * « Appris » at step 2 (MEM-46): the item goes straight from "À apprendre"
 * to "Appris", without entering the review. Returns false when the API
 * refused it. No revalidatePath, for the same reason as above.
 */
export async function learnedAction(itemId: string): Promise<boolean> {
  if (typeof itemId !== 'string') {
    throw new Error('Invalid item');
  }
  try {
    await markItemLearned(itemId);
  } catch (error) {
    if (error instanceof ApiError) return false;
    throw error;
  }
  return true;
}
