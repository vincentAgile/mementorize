import { describe, expect, it } from 'vitest';
import { analyzeImport } from './vocabulary-import.js';

const existing = [{ english: 'Snag', french: 'accroc' }];
const analyze = (text: string, separator = ';') => analyzeImport(text, separator, existing);
// The lines of a file, after its header line.
const HEAD = 'Français;Anglais\n';

describe('analyzeImport (MEM-53)', () => {
  it('skips the header line, whatever its titles, and reads the five columns, trimmed', () => {
    const result = analyze(
      '﻿Expression française;Expression anglaise;Thématique;Phrase exemple français;Phrase exemple anglais\r\n' +
        ' chérir ; to cherish ;Émotions;Je chéris.;I cherish.\r\n',
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          french: 'chérir',
          english: 'to cherish',
          topic: 'Émotions',
          frenchExample: 'Je chéris.',
          example: 'I cherish.',
          status: 'new',
        },
      ],
      summary: { total: 1, new: 1, duplicate: 0, error: 0 },
    });
  });

  it('accepts lines of 2 to 5 columns, and reports the others and the missing expressions', () => {
    const result = analyze(HEAD + 'élan;momentum\n;nothing\nrien;\na;b;c;d;e;f');
    expect(result.ok && result.rows.map((row) => [row.status, row.status === 'error' && row.error])).toEqual([
      ['new', false],
      ['error', 'Expression française manquante'],
      ['error', 'Expression anglaise manquante'],
      ['error', '6 colonnes au lieu de 5 au plus'],
    ]);
  });

  it('reports a text too long', () => {
    const result = analyze(`${HEAD}un;one;${'x'.repeat(51)}`);
    expect(result.ok && result.rows[0]).toMatchObject({
      status: 'error',
      error: 'Thématique trop longue (50 caractères au plus)',
    });
  });

  it('finds duplicates of the vocabulary or of an earlier line, by English or French, ignoring case and spaces', () => {
    const result = analyze(
      HEAD + 'Accroc ;hitch\nobstacle; SNAG\nchérir;to cherish\nCHÉRIR;to treasure\nchérir;To Cherish\nelan;x\nélan;y',
    );
    expect(
      result.ok &&
        result.rows.map(({ line, status, ...rest }) => [
          line,
          status,
          'languages' in rest ? rest.languages : null,
          'of' in rest ? rest.of : null,
        ]),
    ).toEqual([
      [2, 'duplicate', ['fr'], { existing: 'Snag → accroc' }],
      [3, 'duplicate', ['en'], { existing: 'Snag → accroc' }],
      [4, 'new', null, null],
      [5, 'duplicate', ['fr'], { line: 4 }],
      [6, 'duplicate', ['en', 'fr'], { line: 4 }],
      [7, 'new', null, null],
      [8, 'new', null, null], // accents count
    ]);
    expect(result.ok && result.summary).toEqual({ total: 7, new: 3, duplicate: 4, error: 0 });
  });

  it('reports the other separator instead of a grid full of errors', () => {
    expect(analyze('Français,Anglais\nchérir,to cherish\naccroc,snag,Travail')).toEqual({
      ok: false,
      problem: 'wrongSeparator',
    });
    expect(analyze(HEAD + 'chérir;to cherish', ',')).toEqual({ ok: false, problem: 'wrongSeparator' });
  });

  it('takes the first line as the header even when it holds an item (MEM-50: a header line is expected)', () => {
    const result = analyze('chérir;to cherish\nélan;momentum');
    expect(result.ok && result.rows.map((row) => [row.line, row.english])).toEqual([[2, 'momentum']]);
  });

  it('reports an empty file, a broken quote, or too many lines', () => {
    expect(analyze('Expression française;Expression anglaise\r\n')).toEqual({ ok: false, problem: 'empty' });
    expect(analyze(HEAD + 'a;"b\nc;d')).toEqual({ ok: false, problem: 'syntax', line: 2 });
    expect(analyze(HEAD + 'a;b\n'.repeat(2001))).toEqual({ ok: false, problem: 'tooManyLines' });
    expect(analyze(HEAD + 'a;b\n'.repeat(2000))).toMatchObject({ ok: true });
  });
});
