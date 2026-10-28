'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, createMindMap } from '../../../lib/api';

/** The longest central topic (MEM-99), as the field allows. */
const MAX_TOPIC = 200;

export interface MindMapAddState {
  /** Sent back after an error, so that the field keeps what was typed. */
  topic?: string;
  /** Next to the field. */
  error?: string;
}

/**
 * The tab « Ajouter » of the Cartes mentales space (MEM-99): creates a map,
 * its central topic only, then opens its editor, where the branches are added.
 */
export async function createMindMapAction(_previous: MindMapAddState, formData: FormData): Promise<MindMapAddState> {
  const topic = String(formData.get('topic') ?? '').trim();
  if (!topic) return { topic, error: 'Le sujet central est requis.' };
  if (topic.length > MAX_TOPIC) return { topic, error: `Le sujet central fait ${MAX_TOPIC} caractères au plus.` };

  let id: string;
  try {
    const map = await createMindMap([
      { id: crypto.randomUUID(), parentId: null, label: topic, position: { x: 0, y: 0 } },
    ]);
    id = map.id;
  } catch (error) {
    // Only the API errors here: the redirect of an expired session must go on.
    if (error instanceof ApiError) return { topic, error: 'Impossible de créer la carte : réessaie.' };
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counters
  redirect(`/mind-maps/${id}`); // outside the try/catch: redirect() works by throwing
}
