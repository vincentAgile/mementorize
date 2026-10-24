'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, deleteItems, moveInLearningQueue, queueItems, relearnItem, savePreferences } from '../../lib/api';
import type { ListType } from '../../lib/types';

// The actions of the list of a space, the vocabulary (MEM-16) or the quotes
// (MEM-69). A Server Action is a public endpoint: its arguments are checked.

const LIST_TYPES: readonly ListType[] = ['Vocabulary', 'Quote'];

function checkIds(type: ListType, ids: string[]) {
  if (
    !LIST_TYPES.includes(type) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 10_000 ||
    ids.some((id) => typeof id !== 'string')
  ) {
    throw new Error('Invalid selection');
  }
}

/**
 * MEM-58: the number of items per page of the lists, kept with the
 * account's preferences (one for both spaces). No revalidatePath: the table
 * already shows the new size.
 */
export async function savePageSizeAction(size: number): Promise<void> {
  if (![20, 50, 100].includes(size)) throw new Error('Invalid page size');
  try {
    await savePreferences({ vocabularyPageSize: size });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error; // the table works without it
  }
}

/**
 * MEM-59, MEM-69: deletes the selected items, with their cards and history,
 * in a single request. Returns how many were deleted, or null when it failed.
 */
export async function deleteItemsAction(type: ListType, ids: string[]): Promise<number | null> {
  checkIds(type, ids);
  let deleted: number;
  try {
    deleted = await deleteItems(type, ids);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counters, the review
  return deleted;
}

/**
 * MEM-63: puts the items "En attente" among `ids` in the learning queue of
 * their space (last, in the order of the list), or takes those of the queue
 * out of it; MEM-64 ("top"): puts those of the queue at its head, in their
 * order. The others are ignored. Null when it failed.
 */
export async function queueItemsAction(
  type: ListType,
  op: 'add' | 'remove' | 'top',
  ids: string[],
): Promise<{ changed: number; ignored: number } | null> {
  if (!['add', 'remove', 'top'].includes(op)) throw new Error('Invalid queue change');
  checkIds(type, ids);
  let result: { changed: number; ignored: number };
  try {
    result = await queueItems(type, op, ids);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counter of "Apprendre"
  return result;
}

/** MEM-63: the same, for one row (a form's action). */
export async function queueRowAction(type: ListType, op: 'add' | 'remove', id: string): Promise<void> {
  await queueItemsAction(type, op, [id]);
}

/**
 * MEM-64: moves an item of the learning queue to a position. Returns where
 * it is now, or null when it failed (the list then shows the order before).
 */
export async function moveInQueueAction(
  type: ListType,
  id: string,
  position: number,
): Promise<{ position: number; total: number } | null> {
  if (!LIST_TYPES.includes(type) || typeof id !== 'string' || !Number.isInteger(position) || position < 1) {
    throw new Error('Invalid move');
  }
  let result: { position: number; total: number };
  try {
    result = await moveInLearningQueue(type, id, position);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  revalidatePath('/', 'layout');
  return result;
}

/**
 * A learned item back in the review, with the schedule it had: « Remettre
 * en apprentissage » a word (MEM-22), « Remettre en révision » a quote
 * (MEM-69).
 */
export async function relearnAction(id: string): Promise<void> {
  if (typeof id !== 'string') throw new Error('Invalid item');
  await relearnItem(id);
  revalidatePath('/', 'layout'); // the list and the counters
}
