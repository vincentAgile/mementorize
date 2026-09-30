'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, deleteMindMap, saveMindMap } from '../../../lib/api';
import type { MindMapNode } from '../../../lib/types';

export interface SaveResult {
  error?: string;
}

// Server Actions are public endpoints: the arguments come from the browser
// and are checked before being forwarded. The API validates the tree in
// depth (one root, no cycle…); this is only a first filter.
function isNodeList(value: unknown): value is MindMapNode[] {
  return (
    Array.isArray(value) &&
    value.every(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        typeof node.id === 'string' &&
        (node.parentId === null || typeof node.parentId === 'string') &&
        typeof node.label === 'string' &&
        typeof node.position?.x === 'number' &&
        typeof node.position?.y === 'number',
    )
  );
}

export async function saveMindMapAction(id: string, nodes: MindMapNode[]): Promise<SaveResult> {
  if (typeof id !== 'string' || !isNodeList(nodes)) {
    return { error: 'Carte invalide.' };
  }
  if (nodes.some((node) => !node.label.trim())) {
    return { error: 'Chaque idée doit avoir un libellé.' };
  }

  try {
    await saveMindMap(id, nodes);
  } catch (error) {
    // Only API errors are turned into a message: the redirect thrown when
    // the session has expired must keep propagating.
    if (error instanceof ApiError) {
      return { error: error.status === 400 ? 'La carte a été refusée par le serveur.' : "Impossible d'enregistrer la carte." };
    }
    throw error;
  }

  revalidatePath(`/mind-maps/${id}`);
  revalidatePath('/'); // list of items, due counter
  revalidatePath('/review'); // new or removed branch cards
  return {};
}

export async function deleteMindMapAction(id: string): Promise<void> {
  if (typeof id !== 'string') throw new Error('Invalid id');
  await deleteMindMap(id);
  revalidatePath('/');
  redirect('/?type=MindMap');
}
