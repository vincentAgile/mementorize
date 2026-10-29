import { reviewAction } from '../review/actions';
import type { Answer } from '../review/rating-buttons';
import { learnAction, learnedAction } from './actions';

/** What became of an item of a learning session, once its answers are sent. */
export type Outcome = 'learning' | 'learned' | 'failed';

/**
 * The end of a learning session (MEM-21, MEM-68): the answers given to an
 * item, sent in their order. The first one moves it out of "À apprendre":
 * « Appris » straight to "Appris" (MEM-46), a rating to "En cours
 * d'apprentissage" as the first review of its card; the next ones are
 * reviews of that card (« À revoir » put it back in the pile, MEM-47), or
 * « Appris » in the end. Sent once the item is through (the vocabulary,
 * MEM-104) or at the end of the session (the quotes): an item not sent
 * stays "À apprendre".
 */
export async function sendAnswers(itemId: string, cardId: string, answers: Answer[]): Promise<Outcome | null> {
  const [first, ...next] = answers;
  if (!first) return null; // not answered
  let ok = first === 'Learned' ? await learnedAction(itemId) : (await learnAction(itemId, first)) !== null;
  for (const answer of next) {
    if (!ok) break;
    ok = answer === 'Learned' ? await learnedAction(itemId) : (await reviewAction(cardId, answer)) !== null;
  }
  if (!ok) return 'failed';
  return answers.at(-1) === 'Learned' ? 'learned' : 'learning';
}
