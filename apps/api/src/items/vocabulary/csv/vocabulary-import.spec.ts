import { describe, expect, it } from 'vitest';
import { analyzeImport } from './vocabulary-import.js';

const existing = [{ english: 'Snag', french: 'accroc' }];
const analyze = (text: string, separator = ';') =>
  analyzeImport(text, separator, separator === ';' ? ',' : ';', existing);

describe('analyzeImport (MEM-53)', () => {
  it('skips the header line and reads the five columns, trimmed', () => {
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
    const result = analyze('élan;momentum\n;nothing\nrien;\na;b;c;d;e;f');
    expect(result.ok && result.rows.map((row) => [row.status, row.status === 'error' && row.error])).toEqual([
      ['new', false],
      ['error', 'Expression française manquante'],
      ['error', 'Expression anglaise manquante'],
      ['error', '6 colonnes au lieu de 5 au plus'],
    ]);
  });

  it('reports a text too long', () => {
    const result = analyze(`un;one;${'x'.repeat(51)}`);
    expect(result.ok && result.rows[0]).toMatchObject({
      status: 'error',
      error: 'Thématique trop longue (50 caractères au plus)',
    });
  });

  it('finds duplicates of the vocabulary or of an earlier line, by English or French, ignoring case and spaces', () => {
    const result = analyze(
      'Accroc ;hitch\nobstacle; SNAG\nchérir;to cherish\nCHÉRIR;to treasure\nchérir;To Cherish\nelan;x\nélan;y',
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
      [1, 'duplicate', ['fr'], { existing: 'Snag → accroc' }],
      [2, 'duplicate', ['en'], { existing: 'Snag → accroc' }],
      [3, 'new', null, null],
      [4, 'duplicate', ['fr'], { line: 3 }],
      [5, 'duplicate', ['en', 'fr'], { line: 3 }],
      [6, 'new', null, null],
      [7, 'new', null, null], // accents count
    ]);
    expect(result.ok && result.summary).toEqual({ total: 7, new: 3, duplicate: 4, error: 0 });
  });

  it('reports the other separator instead of a grid full of errors', () => {
    expect(analyze('chérir,to cherish\naccroc,snag,Travail')).toEqual({ ok: false, problem: 'wrongSeparator' });
    expect(analyze('chérir;to cherish', ',')).toEqual({ ok: false, problem: 'wrongSeparator' });
  });

  it('reports an empty file, a broken quote, or too many lines', () => {
    expect(analyze('Expression française;Expression anglaise\r\n')).toEqual({ ok: false, problem: 'empty' });
    expect(analyze('a;"b\nc;d')).toEqual({ ok: false, problem: 'syntax', line: 1 });
    expect(analyze('a;b\n'.repeat(2001))).toEqual({ ok: false, problem: 'tooManyLines' });
  });
});
