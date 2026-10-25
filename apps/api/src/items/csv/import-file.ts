import { type CsvRecord, CsvSyntaxError, parseCsv } from './csv.js';
import { COMMON_SEPARATORS } from './separator.js';

/** At most this many lines in a file to import (MEM-53, MEM-72). */
export const MAX_IMPORT_LINES = 2000;

/** Why a whole file can't be imported, instead of a grid of its lines. */
export type ImportProblem =
  | { ok: false; problem: 'empty' | 'tooManyLines' }
  | { ok: false; problem: 'syntax'; line: number }
  /** MEM-80: the common separators the file seems to use instead, the most likely first. */
  | { ok: false; problem: 'wrongSeparator'; candidates: string[] };

/**
 * Reads a file to import (MEM-53, MEM-72): its records after the first
 * line, the header line, always skipped whatever its titles; or why the
 * whole file can't be imported. When its lines only make sense with another
 * separator (`columnsOk` tells whether a line has a valid number of
 * columns), the file is reported as such rather than as a grid of errors,
 * with the common separators it seems to use (MEM-80).
 */
export function readImportFile(
  text: string,
  separator: string,
  columnsOk: (record: CsvRecord) => boolean,
): { ok: true; records: CsvRecord[] } | ImportProblem {
  let all: CsvRecord[];
  try {
    all = parseCsv(text, separator);
  } catch (error) {
    if (error instanceof CsvSyntaxError) return { ok: false, problem: 'syntax', line: error.line };
    throw error;
  }
  const [header, ...records] = all;
  if (records.length === 0) return { ok: false, problem: 'empty' };
  if (records.length > MAX_IMPORT_LINES) return { ok: false, problem: 'tooManyLines' };

  // Another separator: hardly a line has a valid number of columns, but they
  // would with it; or the header line is a single column that it splits into
  // valid columns ("Texte,Auteur,Source").
  const valid = records.filter(columnsOk).length;
  if (valid < records.length / 2 || header.fields.length === 1) {
    const candidates = COMMON_SEPARATORS.filter((other) => other !== separator)
      .map((other) => ({ other, score: otherScore(text, other, valid, header, columnsOk) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ other }) => other);
    if (candidates.length > 0) return { ok: false, problem: 'wrongSeparator', candidates };
  }
  return { ok: true, records };
}

/**
 * How well a file reads with another separator: the number of its valid
 * lines, when they are most of them and more than with the chosen one (or
 * when it splits a single-column header into valid columns); 0 otherwise.
 */
function otherScore(
  text: string,
  other: string,
  valid: number,
  header: CsvRecord,
  columnsOk: (record: CsvRecord) => boolean,
): number {
  let otherHeader: CsvRecord;
  let lines: CsvRecord[];
  try {
    [otherHeader, ...lines] = parseCsv(text, other);
  } catch {
    return 0; // not readable with it either
  }
  const otherValid = lines.filter(columnsOk).length;
  const mostlyValid = lines.length > 0 && otherValid >= lines.length * 0.8;
  if (!mostlyValid) return 0;
  if (otherValid > valid) return otherValid;
  const splitsHeader = header.fields.length === 1 && otherHeader.fields.length > 1 && columnsOk(otherHeader);
  return splitsHeader ? otherValid : 0;
}
