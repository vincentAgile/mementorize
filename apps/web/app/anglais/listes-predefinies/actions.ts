'use server';

import { revalidatePath } from 'next/cache';
import { addFromCatalogList, ApiError, getCatalogList } from '../../../lib/api';

export type AddFromListResult = { added: number; skipped: number; queue: boolean } | { error: string };

/**
 * MEM-118: adds words of a predefined list to the vocabulary, as copies, all
 * or none: those chosen in the content of the list, or every word of the
 * list (« Tout ajouter », `entryIds` null). In the learning queue, or « En
 * attente ». The words already there are skipped by the API.
 */
export async function addFromListAction(
  listId: string,
  entryIds: string[] | null,
  queue: boolean,
): Promise<AddFromListResult> {
  if (typeof listId !== 'string' || (entryIds !== null && !Array.isArray(entryIds))) throw new Error('Invalid list');
  try {
    let ids = entryIds;
    if (ids === null) {
      const list = await getCatalogList(listId);
      if (!list) return { error: 'Cette liste n’est plus proposée : recharge la page.' };
      ids = list.entries.map((entry) => entry.id);
    }
    if (ids.length === 0) return { error: 'Choisis au moins un mot.' };
    const result = await addFromCatalogList(listId, ids, queue === true);
    revalidatePath('/', 'layout'); // the lists, the counters of the menu, the vocabulary
    return { ...result, queue: queue === true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error:
          error.status === 404
            ? 'Cette liste n’est plus proposée : recharge la page.'
            : 'L’ajout a échoué : aucun élément n’a été ajouté. Réessaie.',
      };
    }
    throw error; // e.g. the redirect of an expired session
  }
}
