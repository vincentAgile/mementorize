import type { CsvRecord } from '../../csv/csv.js';
import { type ImportProblem, readImportFile } from '../../csv/import-file.js';

/** Same limits as the entry form (CreateVocabularyDto). */
const MAX = { french: 200, english: 200, topic: 50, frenchExample: 500, example: 500 } as const;

/** The values of a line, trimmed, in the order of the columns. */
export interface ImportValues {
  french: string;
  english: string;
  topic: string;
  frenchExample: string;
  example: string;
}

export type Language = 'en' | 'fr';

export type ImportRow = ImportValues & { line: number } & (
    | { status: 'new' }
    | {
        status: 'duplicate';
        /** Which expressions are already there: the English, the French, or both. */
        languages: Language[];
        /** An item of the vocabulary ("snag → accroc"), or an earlier line of the file. */
        of: { existing: string } | { line: number };
      }
    | { status: 'error'; error: string }
  );

export type ImportAnalysis =
  | {
      ok: true;
      rows: ImportRow[];
      summary: { total: number; new: number; duplicate: number; error: number };
    }
  | ImportProblem;

/** An existing vocabulary item, for the duplicates. */
export interface ExistingPair {
  english: string;
  french: string;
}

/**
 * The key of a duplicate (MEM-50): case and spaces at both ends don't
 * count, accents do ("élan" and "Elan" differ, "Élan" and "élan" don't).
 */
export const duplicateKey = (text: string) => text.trim().toLocaleLowerCase('fr');

const columnsOk = (record: CsvRecord) => record.fields.length >= 2 && record.fields.length <= 5;

/**
 * Reads a file to import (MEM-53) and tells, line by line, what would
 * happen: imported, left out as a duplicate, or in error. Nothing is saved.
 * The first line is the header line, whatever its titles: always skipped.
 * When the lines only make sense with the other separator, the whole file
 * is reported instead (readImportFile).
 */
export function analyzeImport(text: string, separator: string, existing: ExistingPair[]): ImportAnalysis {
  const file = readImportFile(text, separator, columnsOk);
  if (!file.ok) return file;
  const { records } = file;

  const english = new Map<string, { existing: string } | { line: number }>();
  const french = new Map<string, { existing: string } | { line: number }>();
  for (const pair of existing) {
    const label = { existing: `${pair.english} → ${pair.french}` };
    if (!english.has(duplicateKey(pair.english))) english.set(duplicateKey(pair.english), label);
    if (!french.has(duplicateKey(pair.french))) french.set(duplicateKey(pair.french), label);
  }

  const rows = records.map((record): ImportRow => {
    const [french_ = '', english_ = '', topic = '', frenchExample = '', example = ''] = record.fields.map((field) =>
      field.trim(),
    );
    const values: ImportValues & { line: number } = {
      line: record.line,
      french: french_,
      english: english_,
      topic,
      frenchExample,
      example,
    };
    const error = errorOf(record, values);
    if (error) return { ...values, status: 'error', error };

    const sameEnglish = english.get(duplicateKey(values.english));
    const sameFrench = french.get(duplicateKey(values.french));
    if (sameEnglish || sameFrench) {
      const languages: Language[] = [...(sameEnglish ? ['en' as const] : []), ...(sameFrench ? ['fr' as const] : [])];
      // The existing item first, then the earlier line.
      const of = [sameEnglish, sameFrench].find((found) => found && 'existing' in found) ?? sameEnglish ?? sameFrench!;
      return { ...values, status: 'duplicate', languages, of };
    }
    english.set(duplicateKey(values.english), { line: record.line });
    french.set(duplicateKey(values.french), { line: record.line });
    return { ...values, status: 'new' };
  });

  const count = (status: ImportRow['status']) => rows.filter((row) => row.status === status).length;
  return {
    ok: true,
    rows,
    summary: { total: rows.length, new: count('new'), duplicate: count('duplicate'), error: count('error') },
  };
}

function errorOf(record: CsvRecord, values: ImportValues): string | null {
  if (record.fields.length > 5) return `${record.fields.length} colonnes au lieu de 5 au plus`;
  if (!values.french) return 'Expression française manquante';
  if (!values.english) return 'Expression anglaise manquante';
  const tooLong = (Object.keys(MAX) as (keyof typeof MAX)[]).find((key) => values[key].length > MAX[key]);
  if (tooLong) {
    const names = {
      french: 'Expression française',
      english: 'Expression anglaise',
      topic: 'Thématique',
      frenchExample: 'Phrase exemple français',
      example: 'Phrase exemple anglais',
    };
    return `${names[tooLong]} trop longue (${MAX[tooLong]} caractères au plus)`;
  }
  return null;
}
