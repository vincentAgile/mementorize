import type { CsvSeparator } from './types';

/** The character of each CSV separator (MEM-55). */
export const SEPARATOR_CHARS: Record<CsvSeparator, string> = { Semicolon: ';', Comma: ',' };

/** How each one is named in the settings and the Import / export tab. */
export const SEPARATOR_NAMES: Record<CsvSeparator, string> = {
  Semicolon: 'point-virgule ( ; )',
  Comma: 'virgule ( , )',
};

export const CSV_SEPARATORS = Object.keys(SEPARATOR_CHARS) as CsvSeparator[];
