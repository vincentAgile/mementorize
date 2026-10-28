'use server';

import { revalidatePath } from 'next/cache';
import { deleteMindMap } from '../../lib/api';

/**
 * « Supprimer » in the list of the mind maps (MEM-98): the map, its cards
 * and their history. The list is refreshed in place.
 */
export async function deleteMindMapFromListAction(id: string): Promise<void> {
  if (typeof id !== 'string') throw new Error('Invalid id');
  await deleteMindMap(id);
  revalidatePath('/', 'layout'); // the list, the counters, the review
}
