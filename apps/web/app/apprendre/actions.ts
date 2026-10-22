'use server';

import { ApiError, learnVocabulary } from '../../lib/api';
import type { ReviewRating } from '../../lib/types';

const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

/**
 * Step 2 of a learning session (MEM-21): records the rating, the item moves
 * to "En cours d'apprentissage". Returns false when the API refused it (the
 * item was learned in another tab, or deleted meanwhile).
 */
export async function learnAction(itemId: string, rating: ReviewRating): Promise<boolean> {
  // A Server Action is a public endpoint: its arguments are checked.
  if (typeof itemId !== 'string' || !RATINGS.includes(rating)) {
    throw new Error('Invalid rating');
  }
  try {
    await learnVocabulary(itemId, rating);
  } catch (error) {
    if (error instanceof ApiError) return false;
    throw error; // e.g. the redirect of an expired session
  }
  // No revalidatePath here, on purpose: it would render /apprendre again, and
  // after the last rating the page would find nothing left to learn and
  // replace the summary of the session. The pages are dynamic (rendered on
  // each visit, the client cache keeps them 0 s): the counters are up to
  // date as soon as the user leaves the session.
  return true;
}
