import type { CsvSeparator } from './types';

/** The character of each CSV separator (MEM-55). */
export const SEPARATOR_CHARS: Record<CsvSeparator, string> = { Semicolon: ';', Comma: ',' };

/**
 * How each one is named in the settings and the Import / export tab, on a
 * single line (non-breaking hyphen and spaces).
 */
export const SEPARATOR_NAMES: Record<CsvSeparator, string> = {
  Semicolon: 'point\u2011virgule\u00a0(\u00a0;\u00a0)',
  Comma: 'virgule\u00a0(\u00a0,\u00a0)',
};

export const CSV_SEPARATORS = Object.keys(SEPARATOR_CHARS) as CsvSeparator[];

/** The largest file to import (MEM-53): 1 Mo. */
export const MAX_FILE_BYTES = 1_000_000;
