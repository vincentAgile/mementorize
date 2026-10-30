import { describe, expect, it } from 'vitest';
import { analyzeQuoteImport } from './quote-import.js';

const existing = [{ text: 'Connais-toi toi-même.', author: 'Socrate' }];
const analyze = (text: string, separator = ';') => analyzeQuoteImport(text, separator, existing);
const HEAD = 'Texte;Auteur;Source;Indice de rappel\n';

describe('analyzeQuoteImport (MEM-72, MEM-107)', () => {
  it('skips the header line and reads the four columns, trimmed; the text and the recall hint are required', () => {
    const result = analyze(
      '\uFEFFTexte;Auteur;Source;Indice de rappel\r\n Je pense, donc je suis. ; Descartes ;Discours de la méthode; La pensée et l’existence \r\nLa vie est un songe.;;;Le rêve\r\n',
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          text: 'Je pense, donc je suis.',
          author: 'Descartes',
          source: 'Discours de la méthode',
          hint: 'La pensée et l’existence',
          status: 'new',
        },
        { line: 3, text: 'La vie est un songe.', author: '', source: '', hint: 'Le rêve', status: 'new' },
      ],
      summary: { total: 2, new: 2, duplicate: 0, error: 0 },
    });
  });

  it('reads quoted texts holding the separator, quotes and line breaks', () => {
    const result = analyze(`${HEAD}"Il dit : ""Viens; vite"".\nPuis partit.";Moi;;"Un départ; pressé"`);
    expect(result.ok && result.rows[0]).toMatchObject({
      line: 2,
      text: 'Il dit : "Viens; vite".\nPuis partit.',
      hint: 'Un départ; pressé',
      status: 'new',
    });
  });

  it('reports a missing text, a text too long, too many columns, an author or a source too long', () => {
    const result = analyze(
      `${HEAD};Moi;;i\n${'x'.repeat(2001)};;;i\na;b;c;d;e\nb;${'y'.repeat(201)};;i\nc;;${'z'.repeat(301)};i`,
    );
    expect(result.ok && result.rows.map((row) => row.status === 'error' && row.error)).toEqual([
      'Texte manquant',
      'Texte trop long (2000 caractères au plus)',
      '5 colonnes au lieu de 4 au plus',
      'Auteur trop long (200 caractères au plus)',
      'Source trop longue (300 caractères au plus)',
    ]);
  });

  it('reports a missing recall hint (no column, empty cell) or one too long, line by line', () => {
    const result = analyze(
      `${HEAD}Sans colonne.;Moi;Ici\nCellule vide.;Moi;Ici;\nEspaces.;;;   \nTrop long.;;;${'h'.repeat(301)}\nJuste.;;;${'h'.repeat(300)}`,
    );
    expect(result.ok && result.rows.map((row) => (row.status === 'error' ? row.error : row.status))).toEqual([
      'Indice de rappel manquant',
      'Indice de rappel manquant',
      'Indice de rappel manquant',
      'Indice de rappel trop long (300 caractères au plus)',
      'new',
    ]);
  });

  it('shows an old file of three columns line by line, each in error, rather than refusing it', () => {
    const result = analyze('Texte;Auteur;Source\nJe pense, donc je suis.;Descartes;Discours\nLa vie est un songe.;;\n');
    expect(result).toMatchObject({
      ok: true,
      rows: [
        { line: 2, text: 'Je pense, donc je suis.', hint: '', status: 'error', error: 'Indice de rappel manquant' },
        { line: 3, text: 'La vie est un songe.', hint: '', status: 'error', error: 'Indice de rappel manquant' },
      ],
      summary: { total: 2, new: 0, duplicate: 0, error: 2 },
    });
  });

  it('finds the duplicates on the text only, ignoring case and spaces, not accents, whatever their hint', () => {
    const result = analyze(
      `${HEAD} connais-toi   TOI-MÊME. ;Autre;;Un autre indice\nUn texte.;;;i\nun  texte.;X;;j\nUn texté.;;;k`,
    );
    expect(result.ok && result.rows.map((row) => [row.line, row.status, row.status === 'duplicate' && row.of])).toEqual(
      [
        [2, 'duplicate', { existing: 'Connais-toi toi-même. — Socrate' }],
        [3, 'new', false],
        [4, 'duplicate', { line: 3 }],
        [5, 'new', false],
      ],
    );
    expect(result.ok && result.summary).toEqual({ total: 4, new: 2, duplicate: 2, error: 0 });
  });

  it('reports the other separator, by the header line or by the lines', () => {
    expect(
      analyze('Texte,Auteur,Source,Indice\nJe pense,Descartes,Discours,La pensée\nLa vie est un songe.,,,Le rêve'),
    ).toEqual({
      ok: false,
      problem: 'wrongSeparator',
      candidates: [','],
    });
    expect(analyze(`${HEAD}Un;deux`, ',')).toEqual({ ok: false, problem: 'wrongSeparator', candidates: [';'] });
    // A file of texts only, with commas in them: fine with either separator.
    expect(analyze('Texte\nJe pense, donc je suis.\nOui, non.')).toMatchObject({ ok: true });
  });

  it('reports an empty file, a broken quote, too many lines', () => {
    expect(analyze('Texte;Auteur;Source;Indice de rappel\r\n')).toEqual({ ok: false, problem: 'empty' });
    expect(analyze(`${HEAD}"a;b\nc`)).toEqual({ ok: false, problem: 'syntax', line: 2 });
    expect(analyze(HEAD + 'a\n'.repeat(2001))).toEqual({ ok: false, problem: 'tooManyLines' });
  });
});
