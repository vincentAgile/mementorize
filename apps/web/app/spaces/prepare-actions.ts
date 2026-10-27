'use server';

import { redirect } from 'next/navigation';
import { getItems, queueItems } from '../../lib/api';
import { MAX_SESSION_SIZE } from '../../lib/session-preparation';
import type { ListType } from '../../lib/types';

const TYPES: readonly ListType[] = ['Vocabulary', 'Quote'];

/**
 * « Commencer » on the preparation page (MEM-94): the items chosen "En
 * attente" join the learning queue, last, in the order of the list (as
 * MEM-63); then the session starts on the list, in its order. Until now,
 * the queue was not touched. Returns a message when nothing can be learned
 * any more (the items were learned or deleted in another tab meanwhile).
 */
export async function startSessionAction(type: ListType, ids: string[]): Promise<{ error: string }> {
  // A Server Action is a public endpoint: its arguments are checked.
  if (
    !TYPES.includes(type) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_SESSION_SIZE ||
    !ids.every((id) => typeof id === 'string')
  ) {
    throw new Error('Invalid session');
  }
  const status = new Map((await getItems(type)).map((item) => [item.id, item.learningStatus]));
  const kept = [...new Set(ids)].filter((id) => status.get(id) === 'ToLearn' || status.get(id) === 'Waiting');
  if (kept.length === 0) {
    return { error: 'Ces éléments ne sont plus à apprendre : rechargez la page.' };
  }
  const waiting = kept.filter((id) => status.get(id) === 'Waiting');
  if (waiting.length > 0) await queueItems(type, 'add', waiting);
  redirect(`/apprendre?${type === 'Quote' ? 'type=Quote&' : ''}ids=${kept.join(',')}`);
}
