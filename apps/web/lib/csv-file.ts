import 'server-only';
import { MAX_FILE_BYTES } from './csv-separator';

/**
 * The text of a CSV file sent by a form (MEM-53), or why it can't be read:
 * decoded here, UTF-8 with or without BOM; anything else (a file saved as
 * "CSV (Windows)" in Latin-1, a spreadsheet…) is unreadable. The import of
 * the users (app/csv) and of the console's predefined lists (MEM-117).
 * Tutoiement everywhere, the console too (MEMENTORIZE.md).
 */
export async function readCsvFile(formData: FormData): Promise<string | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisis un fichier CSV.' };
  if (file.size > MAX_FILE_BYTES) {
    return {
      error: `Ce fichier dépasse 1 Mo : découpe-le en plusieurs fichiers.`,
    };
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return {
      error: `Fichier illisible : il doit être un fichier CSV encodé en UTF-8. Dans Excel, choisis « CSV UTF-8 » à l’enregistrement.`,
    };
  }
}
