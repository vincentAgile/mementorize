'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, importVocabularyCsv, previewVocabularyImport, savePreferences } from '../../../lib/api';
import { CSV_SEPARATORS, MAX_FILE_BYTES } from '../../../lib/csv-separator';
import type { CsvSeparator, ImportAnalysis, ImportResult } from '../../../lib/types';

export type PreviewResult = { analysis: ImportAnalysis } | { error: string };

/**
 * MEM-53: reads the chosen file and asks the API what importing it would do.
 * The file is decoded here: UTF-8, with or without BOM; anything else (a
 * file saved as "CSV (Windows)" in Latin-1, a spreadsheet…) is unreadable.
 */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const content = await readFile(formData);
  if (typeof content !== 'string') return content;
  try {
    return { analysis: await previewVocabularyImport(content) };
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Impossible d’analyser ce fichier pour le moment. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
}

/** The text of the file sent, or why it can't be read. */
async function readFile(formData: FormData): Promise<string | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisis un fichier CSV.' };
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'Ce fichier dépasse 1\u00a0Mo : découpe-le en plusieurs fichiers.' };
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return {
      error:
        'Fichier illisible : il doit être un fichier CSV encodé en UTF-8. Dans Excel, choisis « CSV UTF-8 » à l’enregistrement.',
    };
  }
}

export type ImportActionResult = { result: ImportResult } | { error: string };

/**
 * MEM-54: imports the lines "to import" of the file, after the user's
 * confirmation. The API analyses it again (the vocabulary may have changed)
 * and saves them all at once, or nothing.
 */
export async function importAction(formData: FormData): Promise<ImportActionResult> {
  const content = await readFile(formData);
  if (typeof content !== 'string') return content;
  let result: ImportResult;
  try {
    result = await importVocabularyCsv(content);
  } catch (error) {
    if (error instanceof ApiError) return { error: 'L’import a échoué : rien n’a été enregistré. Réessaie.' };
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counter of "Apprendre", the export
  return { result };
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
