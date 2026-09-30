'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, createMindMap, createQuote, createVocabulary } from '../../lib/api';
import type { ItemType } from '../../lib/types';

export interface ItemFormState {
  type?: ItemType;
  error?: string;
  values?: Record<string, string>; // sent back so fields aren't emptied after an error
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

export async function createItemAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const type = field(formData, 'type') as ItemType;
  let createdMapId: string | undefined;

  try {
    if (type === 'Quote') {
      const values = { text: field(formData, 'text'), author: field(formData, 'author') };
      if (!values.text) return { type, values, error: 'Le texte de la citation est requis.' };
      await createQuote({ text: values.text, author: values.author || undefined });
    } else if (type === 'Vocabulary') {
      const values = {
        word: field(formData, 'word'),
        translation: field(formData, 'translation'),
        example: field(formData, 'example'),
      };
      if (!values.word || !values.translation) {
        return { type, values, error: 'Le mot et sa traduction sont requis.' };
      }
      await createVocabulary({ word: values.word, translation: values.translation, example: values.example || undefined });
    } else if (type === 'MindMap') {
      const values = { topic: field(formData, 'topic') };
      if (!values.topic) return { type, values, error: 'Le sujet central est requis.' };
      // A new map is just its root; branches are added in the editor.
      const map = await createMindMap([{ id: crypto.randomUUID(), parentId: null, label: values.topic, position: { x: 0, y: 0 } }]);
      createdMapId = map.id;
    } else {
      return { error: 'Type de fiche inconnu.' };
    }
  } catch (error) {
    // Only handle API errors here; anything else (including the redirect
    // thrown when the session has expired) must keep propagating.
    if (error instanceof ApiError) {
      return { type, error: "Impossible d'enregistrer la fiche." };
    }
    throw error;
  }

  revalidatePath('/');
  if (createdMapId) {
    redirect(`/mind-maps/${createdMapId}`); // outside the try/catch: redirect() works by throwing
  }
  return { type };
}
