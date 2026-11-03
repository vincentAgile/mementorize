'use server';

import { revalidatePath } from 'next/cache';
import {
  type CatalogImportAnalysis,
  type CatalogImportResult,
  createCatalogEntry,
  deleteCatalogEntries,
  deleteCatalogEntry,
  importCatalogCsv,
  previewCatalogImport,
  updateCatalogEntry,
  updateCatalogList,
} from '../../../../../lib/admin-api';
import { API_MESSAGES, ENTRY_MESSAGES, type EntryField, entryErrors } from '../../../../../lib/catalog';
import { readCsvFile } from '../../../../../lib/csv-file';

export type EntryValues = Record<EntryField, string>;

export interface EntryFormState {
  values?: EntryValues;
  fieldErrors?: Partial<Record<EntryField, string>>;
  error?: string;
  /** The English of the word just saved, for the confirmation; its topic stays for the next one. */
  saved?: { word: string; topic: string };
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();
const check = (id: unknown) => {
  if (typeof id !== 'string' || !id) throw new Error('Invalid id');
};
const refresh = (listId: string) => {
  revalidatePath(`/admin/catalogue/${listId}`);
  revalidatePath('/admin/catalogue'); // the number of words of the table
};

/**
 * MEM-117: adds a word at the end of the list (`id` null) or changes one.
 * The same fields and checks as the « Ajouter » tab of the users; then the
 * API's: the same English already in the list comes back under its field.
 */
export async function saveEntryAction(
  listId: string,
  id: string | null,
  _previous: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  check(listId);
  if (id !== null) check(id);
  const values: EntryValues = {
    word: text(formData, 'word'),
    example: text(formData, 'example'),
    translation: text(formData, 'translation'),
    frenchExample: text(formData, 'frenchExample'),
    topic: text(formData, 'topic'),
  };
  const fieldErrors = entryErrors(values);
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const input = {
    french: values.translation,
    english: values.word,
    topic: values.topic,
    frenchExample: values.frenchExample,
    englishExample: values.example,
  };
  const result = id === null ? await createCatalogEntry(listId, input) : await updateCatalogEntry(listId, id, input);
  if (!result.ok) {
    const known = result.message ? ENTRY_MESSAGES[result.message] : undefined;
    if (known?.field) return { values, fieldErrors: { [known.field]: known.message } };
    return { values, error: known?.message ?? failure(result.status, 'Impossible d’enregistrer le mot.') };
  }
  refresh(listId);
  return { saved: { word: values.word, topic: values.topic } };
}

export interface DeleteEntryState {
  error?: string;
}

/** MEM-117: the word is gone from the list; the vocabularies of the users don't change. */
export async function deleteEntryAction(listId: string, id: string): Promise<DeleteEntryState> {
  check(listId);
  check(id);
  const result = await deleteCatalogEntry(listId, id);
  if (!result.ok && result.status !== 404) {
    const known = result.message ? ENTRY_MESSAGES[result.message] : undefined;
    return { error: known?.message ?? failure(result.status, 'Impossible de supprimer le mot.') };
  }
  refresh(listId);
  return {};
}

export type DeleteEntriesResult = { deleted: number } | { error: string };

/** The words selected in the table, all at once; the vocabularies of the users don't change. */
export async function deleteEntriesAction(listId: string, ids: string[]): Promise<DeleteEntriesResult> {
  check(listId);
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid words');
  }
  const result = await deleteCatalogEntries(listId, ids);
  if (!result.ok) {
    const known = result.message ? ENTRY_MESSAGES[result.message] : undefined;
    return { error: known?.message ?? failure(result.status, 'Impossible de supprimer les mots sélectionnés.') };
  }
  refresh(listId);
  return { deleted: result.deleted };
}

export interface PublishState {
  error?: string;
}

/** MEM-117: « Publier » / « Dépublier », from the header of the list; an empty list can't be published (MEM-116). */
export async function publishAction(listId: string, published: boolean): Promise<PublishState> {
  check(listId);
  const result = await updateCatalogList(listId, { published: published === true });
  if (!result.ok) {
    const known = result.message ? API_MESSAGES[result.message] : undefined;
    return { error: known?.message ?? failure(result.status, 'Impossible de changer l’état de la liste.') };
  }
  refresh(listId);
  return {};
}

export type CatalogPreviewResult = { analysis: CatalogImportAnalysis } | { error: string };

/** MEM-117: what importing the chosen file into the list would do, line by line. Nothing is saved. */
export async function previewCatalogImportAction(listId: string, formData: FormData): Promise<CatalogPreviewResult> {
  check(listId);
  const content = await readCsvFile(formData, false);
  if (typeof content !== 'string') return content;
  const analysis = await previewCatalogImport(listId, content);
  return analysis ? { analysis } : { error: 'Impossible d’analyser ce fichier pour le moment. Réessayez.' };
}

export type CatalogImportActionResult = { result: CatalogImportResult } | { error: string };

/** MEM-117: once confirmed, the lines "to import", analysed again by the API and saved all at once, or none. */
export async function importCatalogAction(listId: string, formData: FormData): Promise<CatalogImportActionResult> {
  check(listId);
  const content = await readCsvFile(formData, false);
  if (typeof content !== 'string') return content;
  const result = await importCatalogCsv(listId, content);
  if (!result) return { error: 'L’import a échoué : rien n’a été enregistré. Réessayez.' };
  if (result.ok) refresh(listId);
  return { result };
}

function failure(status: number | null, otherwise: string): string {
  if (status === null) return 'Le serveur ne répond pas. Réessayez dans un instant.';
  if (status === 404) return 'Ce mot ou cette liste n’existe plus : rechargez la page.';
  return otherwise;
}
