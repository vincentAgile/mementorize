/**
 * CSV as in RFC 4180, for the import / export of the vocabulary (MEM-50):
 * fields between double quotes when they hold the separator, a double quote
 * or a line break, a double quote doubled inside them. Lines end with CRLF.
 */

/** The character of each separator, as chosen in the settings (MEM-55). */
export const SEPARATOR_CHARS = { Semicolon: ';', Comma: ',' } as const;

export const BOM = '﻿';

function field(value: string, separator: string): string {
  return /["\r\n]/.test(value) || value.includes(separator) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The lines of a file, preceded by the UTF-8 BOM (Excel then opens it as UTF-8). */
export function toCsv(lines: string[][], separator: string): string {
  return BOM + lines.map((line) => line.map((value) => field(value, separator)).join(separator) + '\r\n').join('');
}

/** A record of the file, with the number of the line where it starts (1 = first line). */
export interface CsvRecord {
  line: number;
  fields: string[];
}

export class CsvSyntaxError extends Error {
  constructor(readonly line: number) {
    super(`Unterminated quoted field starting on line ${line}`);
  }
}

/**
 * Reads a file: the BOM is skipped, line breaks may be CRLF or LF (also
 * inside quoted fields), empty lines are skipped. A quoted field that is
 * never closed is a syntax error.
 */
export function parseCsv(text: string, separator: string): CsvRecord[] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let value = '';
  let line = 1;
  let start = 1;
  let quoted = false;
  let quoteLine = 0;
  let empty = true; // nothing on the current record yet

  const endRecord = () => {
    fields.push(value);
    if (!(empty && fields.length === 1 && value === '')) records.push({ line: start, fields });
    fields = [];
    value = '';
    empty = true;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line++;
        value += char;
      }
    } else if (char === '"' && value === '') {
      quoted = true;
      quoteLine = line;
      empty = false;
    } else if (char === separator) {
      fields.push(value);
      value = '';
      empty = false;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      endRecord();
      line++;
      start = line;
    } else {
      value += char;
      empty = false;
    }
  }
  if (quoted) throw new CsvSyntaxError(quoteLine);
  if (!empty || value !== '' || fields.length > 0) endRecord();
  return records;
}
