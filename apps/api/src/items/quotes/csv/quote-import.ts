import type { CsvRecord } from '../../csv/csv.js';
import { type ImportProblem, readImportFile } from '../../csv/import-file.js';

/** Same limits as the entry form (CreateQuoteDto). */
const MAX = { text: 2000, author: 200, source: 300, hint: 300 } as const;

/** The values of a line, trimmed, in the order of the columns. */
export interface QuoteImportValues {
  text: string;
  author: string;
  source: string;
  /** MEM-106: required; the file has no column for it yet (MEM-107), so every line is in error. */
  hint: string;
}

export type QuoteImportRow = QuoteImportValues & { line: number } & (
    | { status: 'new' }
    /** The same text as a quote already there ("Connais-toi toi-même. — Socrate"), or as an earlier line. */
    | { status: 'duplicate'; of: { existing: string } | { line: number } }
    | { status: 'error'; error: string }
  );

export type QuoteImportAnalysis =
  | {
      ok: true;
      rows: QuoteImportRow[];
      summary: { total: number; new: number; duplicate: number; error: number };
    }
  | ImportProblem;

/** An existing quote, for the duplicates. */
export interface ExistingQuote {
  text: string;
  author: string | null;
}

/**
 * The key of a duplicate (MEM-72): case, spaces at both ends and repeated
 * spaces don't count; accents and punctuation do.
 */
export const quoteKey = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');

/** A text, an author, a source: 1 to 3 columns. */
const columnsOk = (record: CsvRecord) => record.fields.length >= 1 && record.fields.length <= 3;

/** How an existing quote is named in the grid: its first words and its author. */
function label({ text, author }: ExistingQuote): string {
  const words = text.trim().split(/\s+/);
  const start = words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : words.join(' ');
  return author ? `${start} — ${author}` : start;
}

/**
 * Reads a file of quotes to import (MEM-72) and tells, line by line, what
 * would happen: imported, left out as a duplicate, or in error. Nothing is
 * saved. Same course as the vocabulary (MEM-53): the header line skipped,
 * the whole file reported when it seems to use the other separator.
 */
export function analyzeQuoteImport(text: string, separator: string, existing: ExistingQuote[]): QuoteImportAnalysis {
  const file = readImportFile(text, separator, columnsOk);
  if (!file.ok) return file;

  const seen = new Map<string, { existing: string } | { line: number }>();
  for (const quote of existing) {
    if (!seen.has(quoteKey(quote.text))) seen.set(quoteKey(quote.text), { existing: label(quote) });
  }

  const rows = file.records.map((record): QuoteImportRow => {
    const [text = '', author = '', source = '', hint = ''] = record.fields.map((field) => field.trim());
    const values = { line: record.line, text, author, source, hint };
    const error = errorOf(record, values);
    if (error) return { ...values, status: 'error', error };

    const same = seen.get(quoteKey(text));
    if (same) return { ...values, status: 'duplicate', of: same };
    seen.set(quoteKey(text), { line: record.line });
    return { ...values, status: 'new' };
  });

  const count = (status: QuoteImportRow['status']) => rows.filter((row) => row.status === status).length;
  return {
    ok: true,
    rows,
    summary: { total: rows.length, new: count('new'), duplicate: count('duplicate'), error: count('error') },
  };
}

function errorOf(record: CsvRecord, values: QuoteImportValues): string | null {
  if (record.fields.length > 3) return `${record.fields.length} colonnes au lieu de 3 au plus`;
  if (!values.text) return 'Texte manquant';
  if (values.text.length > MAX.text) return `Texte trop long (${MAX.text} caractères au plus)`;
  if (values.author.length > MAX.author) return `Auteur trop long (${MAX.author} caractères au plus)`;
  if (values.source.length > MAX.source) return `Source trop longue (${MAX.source} caractères au plus)`;
  // MEM-106: no quote without its recall hint.
  if (!values.hint) return 'Indice de rappel manquant';
  if (values.hint.length > MAX.hint) return `Indice de rappel trop long (${MAX.hint} caractères au plus)`;
  return null;
}
