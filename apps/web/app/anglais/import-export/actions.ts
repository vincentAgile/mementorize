'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, previewVocabularyImport, savePreferences } from '../../../lib/api';
import { CSV_SEPARATORS, MAX_FILE_BYTES } from '../../../lib/csv-separator';
import type { CsvSeparator, ImportAnalysis } from '../../../lib/types';

export type PreviewResult = { analysis: ImportAnalysis } | { error: string };

/**
 * MEM-53: reads the chosen file and asks the API what importing it would do.
 * The file is decoded here: UTF-8, with or without BOM; anything else (a
 * file saved as "CSV (Windows)" in Latin-1, a spreadsheet…) is unreadable.
 */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisis un fichier CSV.' };
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'Ce fichier dépasse 1\u00a0Mo : découpe-le en plusieurs fichiers.' };
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return {
      error:
        'Fichier illisible : il doit être un fichier CSV encodé en UTF-8. Dans Excel, choisis « CSV UTF-8 » à l’enregistrement.',
    };
  }

  try {
    return { analysis: await previewVocabularyImport(content) };
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Impossible d’analyser ce fichier pour le moment. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
}

/**
 * The file seems to use the other separator (MEM-53): change the setting
 * (MEM-55), then read it again.
 */
export async function switchSeparatorAction(separator: CsvSeparator, formData: FormData): Promise<PreviewResult> {
  if (!CSV_SEPARATORS.includes(separator)) throw new Error('Invalid separator');
  try {
    await savePreferences({ csvSeparator: separator });
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Impossible de changer le séparateur.' };
    throw error;
  }
  revalidatePath('/', 'layout'); // the separator shown in the tab and the settings
  return previewImportAction(formData);
}
