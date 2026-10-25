import { describe, expect, it } from 'vitest';
import { BOM, CsvSyntaxError, parseCsv, toCsv } from './csv.js';

describe('CSV (MEM-50)', () => {
  it('writes the BOM, CRLF line ends, and quotes only the fields that need it', () => {
    const csv = toCsv(
      [
        ['a', 'b;c', 'say "hi"'],
        ['two\nlines', '', 'x,y'],
      ],
      ';',
    );
    expect(csv).toBe(`${BOM}a;"b;c";"say ""hi"""\r\n"two\nlines";;x,y\r\n`);
  });

  it('reads back what it writes, whatever the separator', () => {
    const lines = [
      ['Français', 'Anglais', '', 'Exemple ; avec "guillemets"', 'Two\r\nlines, here'],
      ['élan', 'momentum', 'Sport', '', ''],
    ];
    for (const separator of [';', ',']) {
      expect(parseCsv(toCsv(lines, separator), separator).map((record) => record.fields)).toEqual(lines);
    }
  });

  it('reads LF or CRLF, without BOM, skips empty lines and gives the starting line of each record', () => {
    const records = parseCsv('a;b\n\n"multi\nline";c\r\nd;e', ';');
    expect(records).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 3, fields: ['multi\nline', 'c'] },
      { line: 5, fields: ['d', 'e'] },
    ]);
  });

  it('rejects a quoted field that is never closed', () => {
    expect(() => parseCsv('a;"b\nc;d', ';')).toThrow(CsvSyntaxError);
  });

  it('writes and reads back any single character as separator (MEM-80)', () => {
    for (const separator of ['|', '\t', ' ', 'é', '🙂']) {
      const lines = [['a b', `x${separator}y`, 'say "hi"', '']];
      const csv = toCsv(lines, separator);
      expect(parseCsv(csv, separator).map((record) => record.fields)).toEqual(lines);
    }
  });
});
