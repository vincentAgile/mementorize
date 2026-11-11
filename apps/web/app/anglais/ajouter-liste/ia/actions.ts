'use server';

import { revalidatePath } from 'next/cache';
import { addAiList, ApiError } from '../../../../lib/api';
import { type AiListRow, ROW_MAX, TOPIC_MAX } from '../../../../lib/ai-lists';

export type AddAiListResult = { added: number; skipped: number; queue: boolean } | { error: string };

const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);

/**
 * MEM-141: adds the rows of the preview to « Ma liste », all or none, in
 * their order, the label of the theme as their topic; in the learning queue
 * or « En attente ». The API checks them again and skips those already
 * there.
 */
export async function addAiListAction(rows: AiListRow[], theme: string, queue: boolean): Promise<AddAiListResult> {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 20 || typeof theme !== 'string') {
    throw new Error('Invalid rows');
  }
  const checked = rows.map((row) => ({
    english: text(row?.english, ROW_MAX.english),
    french: text(row?.french, ROW_MAX.french),
    example: text(row?.example ?? '', ROW_MAX.example),
    frenchExample: text(row?.frenchExample ?? '', ROW_MAX.frenchExample),
  }));
  if (
    checked.some(
      (row) => row.english === null || row.french === null || row.example === null || row.frenchExample === null,
    )
  ) {
    throw new Error('Invalid rows');
  }
  try {
    const result = await addAiList(
      checked.map((row) => ({
        english: row.english!,
        french: row.french!,
        ...(row.example && { example: row.example }),
        ...(row.frenchExample && { frenchExample: row.frenchExample }),
      })),
      theme.trim().slice(0, TOPIC_MAX).trim(),
      queue === true,
    );
    revalidatePath('/', 'layout'); // the counters of the menu, the vocabulary
    return { ...result, queue: queue === true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error:
          error.status === 400
            ? 'Une ligne n’est pas valide : vérifie l’anglais et le français de chaque carte. Aucune carte n’a été ajoutée.'
            : 'L’ajout a échoué : aucune carte n’a été ajoutée. Réessaie.',
      };
    }
    throw error; // e.g. the redirect of an expired session
  }
}
