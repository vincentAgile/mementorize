import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * MEM-120, a guard: in the interface, what the Anglais space learns and
 * reviews is a « carte » (MEMENTORIZE.md §4), never an « élément ». The word
 * lives in a single place, lib/nouns.ts (ITEM_NOUN); anywhere else in the
 * sources of the web app and of the API (messages, e-mails), it fails this
 * test, but for the exceptions below, each with its reason.
 * « Élémentaire » (the level A2) and the English « element » (HTMLElement)
 * are other words.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // apps/
const SOURCES = ['web/app', 'web/lib', 'api/src'];

/** The files allowed to say « élément », and why. */
const EXCEPTIONS: Record<string, string> = {
  'web/lib/nouns.ts': 'Le nom des cartes est défini ici : son commentaire rappelle qu’il remplace « élément ».',
  'web/app/mind-maps/topic-node.tsx':
    'Espace Cartes mentales, hors périmètre de MEM-120 : « Élément masqué » y désigne une branche de la carte.',
};

const WORD = /(?<!\p{L})[éÉ]l[éÉ]ments?(?!\p{L})/gu;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(tsx?|css|html|hbs)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('« carte », never « élément » (MEM-120)', () => {
  it('no « élément » in the sources of the interface, but the exceptions', () => {
    const found = SOURCES.flatMap((source) => sourceFiles(join(ROOT, source)))
      .map((path) => relative(ROOT, path))
      .filter((path) => !(path in EXCEPTIONS))
      .flatMap((path) =>
        readFileSync(join(ROOT, path), 'utf8')
          .split('\n')
          .flatMap((line, index) => (line.match(WORD) ? [`${path}:${index + 1}: ${line.trim()}`] : [])),
      );
    expect(found).toEqual([]);
  });

  it('the exceptions still need to be: each file says it', () => {
    for (const path of Object.keys(EXCEPTIONS)) {
      expect(readFileSync(join(ROOT, path), 'utf8')).toMatch(new RegExp(WORD.source, 'u'));
    }
  });

  it('the pattern: « élément(s) », « Élément », not « Élémentaire » nor « element »', () => {
    const matches = (text: string) => (text.match(WORD) ?? []).length;
    expect(matches('Aucun élément ; 3 éléments ; Élément suivant')).toBe(3);
    expect(matches('A2 · Élémentaire, HTMLElement, element')).toBe(0);
  });
});
