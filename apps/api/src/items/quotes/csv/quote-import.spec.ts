import { describe, expect, it } from 'vitest';
import { analyzeQuoteImport } from './quote-import.js';

const existing = [{ text: 'Connais-toi toi-même.', author: 'Socrate' }];
const analyze = (text: string, separator = ';') => analyzeQuoteImport(text, separator, existing);
const HEAD = 'Texte;Auteur;Source\n';

describe('analyzeQuoteImport (MEM-72)', () => {
  // MEM-106: the recall hint is required, and the file has no column for it
  // yet (MEM-107): every line that is right otherwise is in error.
  it('skips the header line and reads the three columns, trimmed; each line misses its recall hint (MEM-106)', () => {
    const result = analyze(
      '﻿Texte;Auteur;Source\r\n Je pense, donc je suis. ; Descartes ;Discours de la méthode\r\nLa vie est un songe.\r\n',
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          text: 'Je pense, donc je suis.',
          author: 'Descartes',
          source: 'Discours de la méthode',
          hint: '',
          status: 'error',
          error: 'Indice de rappel manquant',
        },
        {
          line: 3,
          text: 'La vie est un songe.',
          author: '',
          source: '',
          hint: '',
          status: 'error',
          error: 'Indice de rappel manquant',
        },
      ],
      summary: { total: 2, new: 0, duplicate: 0, error: 2 },
    });
  });

  it('reads quoted texts holding the separator, quotes and line breaks', () => {
    const result = analyze(`${HEAD}"Il dit : ""Viens; vite"".\nPuis partit.";Moi;`);
    expect(result.ok && result.rows[0]).toMatchObject({
      line: 2,
      text: 'Il dit : "Viens; vite".\nPuis partit.',
      status: 'error',
    });
  });

  it('reports a missing text, a text too long, too many columns', () => {
    const result = analyze(`${HEAD};Moi\n${'x'.repeat(2001)}\na;b;c;d\nb;${'y'.repeat(201)}\nc;;${'z'.repeat(301)}`);
    expect(result.ok && result.rows.map((row) => row.status === 'error' && row.error)).toEqual([
      'Texte manquant',
      'Texte trop long (2000 caractères au plus)',
      '4 colonnes au lieu de 3 au plus',
      'Auteur trop long (200 caractères au plus)',
      'Source trop longue (300 caractères au plus)',
    ]);
  });

  it('imports nothing while the file has no recall hint, duplicates included (MEM-106)', () => {
    const result = analyze(`${HEAD} connais-toi   TOI-MÊME. ;Autre\nUn texte.\nun  texte.;X\nUn texté.`);
    expect(result.ok && result.summary).toEqual({ total: 4, new: 0, duplicate: 0, error: 4 });
  });

  it('reports the other separator, by the header line or by the lines', () => {
    expect(analyze('Texte,Auteur,Source\nJe pense,Descartes,Discours\nLa vie est un songe.,,')).toEqual({
      ok: false,
      problem: 'wrongSeparator',
      candidates: [','],
    });
    expect(analyze(`${HEAD}Un;deux`, ',')).toEqual({ ok: false, problem: 'wrongSeparator', candidates: [';'] });
    // A file of texts only, with commas in them: fine with either separator.
    expect(analyze('Texte\nJe pense, donc je suis.\nOui, non.')).toMatchObject({ ok: true });
  });

  it('reports an empty file, a broken quote, too many lines', () => {
    expect(analyze('Texte;Auteur;Source\r\n')).toEqual({ ok: false, problem: 'empty' });
    expect(analyze(`${HEAD}"a;b\nc`)).toEqual({ ok: false, problem: 'syntax', line: 2 });
    expect(analyze(HEAD + 'a\n'.repeat(2001))).toEqual({ ok: false, problem: 'tooManyLines' });
  });
});
