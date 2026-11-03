'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, importCsv, previewImport, savePreferences } from '../../lib/api';
import { separatorProblem } from '../../lib/csv-separator';
import { readCsvFile } from '../../lib/csv-file';
import type { ImportAnalysis, ImportResult, ListType } from '../../lib/types';

const LIST_TYPES: readonly ListType[] = ['Vocabulary', 'Quote'];

export type PreviewResult = { analysis: ImportAnalysis } | { error: string };

// The import of a CSV file, in the Import / export tab of the Anglais space
// (MEM-53, MEM-54) and of the Citations space (MEM-72): `type` says which.

/**
 * MEM-53: reads the chosen file and asks the API what importing it would do.
 * The file is decoded here (readCsvFile).
 */
export async function previewImportAction(type: ListType, formData: FormData): Promise<PreviewResult> {
  if (!LIST_TYPES.includes(type)) throw new Error('Invalid type');
  const content = await readCsvFile(formData);
  if (typeof content !== 'string') return content;
  try {
    return { analysis: await previewImport(type, content) };
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Impossible d’analyser ce fichier pour le moment. Réessaie.' };
    throw error; // e.g. the redirect of an expired session
  }
}

export type ImportActionResult = { result: ImportResult } | { error: string };

/**
 * MEM-54: imports the lines "to import" of the file, after the user's
 * confirmation. The API analyses it again (the items may have changed) and
 * saves them all at once, or nothing.
 */
export async function importAction(type: ListType, formData: FormData): Promise<ImportActionResult> {
  if (!LIST_TYPES.includes(type)) throw new Error('Invalid type');
  const content = await readCsvFile(formData);
  if (typeof content !== 'string') return content;
  let result: ImportResult;
  try {
    result = await importCsv(type, content);
  } catch (error) {
    if (error instanceof ApiError) return { error: 'L’import a échoué : rien n’a été enregistré. Réessaie.' };
    throw error;
  }
  revalidatePath('/', 'layout'); // the list, the counter of "Apprendre", the export
  return { result };
}

/**
 * The file seems to use another separator (MEM-53, MEM-80): change the
 * setting (MEM-55) to the one chosen among those detected, then read it again.
 */
export async function switchSeparatorAction(
  type: ListType,
  separator: string,
  formData: FormData,
): Promise<PreviewResult> {
  if (typeof separator !== 'string' || separatorProblem(separator)) throw new Error('Invalid separator');
  try {
    await savePreferences({ csvSeparator: separator });
  } catch (error) {
    if (error instanceof ApiError) return { error: 'Impossible de changer le séparateur.' };
    throw error;
  }
  revalidatePath('/', 'layout'); // the separator shown in the tab and the settings
  return previewImportAction(type, formData);
}
