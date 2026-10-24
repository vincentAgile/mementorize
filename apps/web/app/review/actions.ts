'use server';

import { ApiError, markCardLearned, markItemLearned, submitReview } from '../../lib/api';
import type { ReviewRating } from '../../lib/types';

const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

// A Server Action is a public HTTP endpoint in disguise: anyone can call it
// with any arguments, so they are validated even though our own buttons
// only ever send valid values.
//
// No revalidatePath here, on purpose (MEM-47): the session keeps its pile in
// the browser, and a new rendering of /review would start another session,
// from the cards due at that time. The counters of the menu are brought up
// to date when the session ends (router.refresh) or when the user leaves it.

/**
 * Rates a card. Returns when it comes back for each rating (the buttons of a
 * card put back at the bottom of the pile), or null when the API refused it
 * (card deleted meanwhile, in another tab).
 */
export async function reviewAction(cardId: string, rating: ReviewRating): Promise<Record<ReviewRating, string> | null> {
  if (typeof cardId !== 'string' || !RATINGS.includes(rating)) {
    throw new Error('Invalid review');
  }
  try {
    return (await submitReview(cardId, rating)).nextDueByRating;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error; // e.g. the redirect of an expired session
  }
}

/**
 * "Appris": for vocabulary and quotes, the item leaves the review (MEM-22,
 * MEM-67); for a mind map branch, only this card (MEM-48). False when refused.
 */
export async function learnedAction(target: { itemId: string } | { cardId: string }): Promise<boolean> {
  const itemId = 'itemId' in target ? target.itemId : undefined;
  const cardId = 'cardId' in target ? target.cardId : undefined;
  if (typeof (itemId ?? cardId) !== 'string') {
    throw new Error('Invalid item');
  }
  try {
    if (itemId !== undefined) await markItemLearned(itemId);
    else await markCardLearned(cardId!);
  } catch (error) {
    if (error instanceof ApiError) return false;
    throw error;
  }
  return true;
}
