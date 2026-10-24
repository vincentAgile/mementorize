import { type CsvRecord, CsvSyntaxError, parseCsv, SEPARATOR_CHARS } from './csv.js';

/** At most this many lines in a file to import (MEM-53, MEM-72). */
export const MAX_IMPORT_LINES = 2000;

/** Why a whole file can't be imported, instead of a grid of its lines. */
export type ImportProblem = {
  ok: false;
  problem: 'empty' | 'tooManyLines' | 'syntax' | 'wrongSeparator';
  line?: number;
};

/** The other separator: the one the file may use instead of the chosen one. */
export const otherSeparator = (separator: string) =>
  separator === SEPARATOR_CHARS.Semicolon ? SEPARATOR_CHARS.Comma : SEPARATOR_CHARS.Semicolon;

/**
 * Reads a file to import (MEM-53, MEM-72): its records after the first
 * line, the header line, always skipped whatever its titles; or why the
 * whole file can't be imported. When its lines only make sense with the
 * other separator (`columnsOk` tells whether a line has a valid number of
 * columns), the file is reported as such rather than as a grid of errors.
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

  // Wrong separator: hardly a line has a valid number of columns, but they
  // would with the other one; or the header line is a single column that
  // the other separator splits into valid columns ("Texte,Auteur,Source").
  const valid = records.filter(columnsOk).length;
  if (valid < records.length / 2 || header.fields.length === 1) {
    try {
      const [otherHeader, ...other] = parseCsv(text, otherSeparator(separator));
      const otherValid = other.filter(columnsOk).length;
      const mostlyValid = other.length > 0 && otherValid >= other.length * 0.8;
      if (mostlyValid && otherValid > valid) return { ok: false, problem: 'wrongSeparator' };
      if (mostlyValid && header.fields.length === 1 && otherHeader.fields.length > 1 && columnsOk(otherHeader)) {
        return { ok: false, problem: 'wrongSeparator' };
      }
    } catch {
      // Not readable with the other separator either: the lines say what's wrong.
    }
  }
  return { ok: true, records };
}
