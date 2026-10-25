/**
 * The separator of the CSV files (MEM-55): any single character since
 * MEM-80, chosen in the settings, but the double quote and the line breaks.
 * How it is named in the settings and the Import / export tabs, on a single
 * line (non-breaking hyphen and spaces).
 */

const NBSP = ' ';
const shown = (char: string) => `(${NBSP}${char}${NBSP})`;

/** The common separators: their name, with its article (« la virgule »), and « à » (« à la virgule »). */
const KNOWN: Record<string, { name: string; the: string; to: string }> = {
  ';': { name: `point‑virgule${NBSP}${shown(';')}`, the: 'le', to: 'au' },
  ',': { name: `virgule${NBSP}${shown(',')}`, the: 'la', to: 'à la' },
  '\t': { name: 'tabulation', the: 'la', to: 'à la' },
  '|': { name: `barre verticale${NBSP}${shown('|')}`, the: 'la', to: 'à la' },
  ':': { name: `deux‑points${NBSP}${shown(':')}`, the: 'les', to: 'aux' },
  ' ': { name: 'espace', the: 'l’', to: 'à l’' },
};

const describe = (char: string) =>
  KNOWN[char] ?? { name: `caractère${NBSP}«${NBSP}${char}${NBSP}»`, the: 'le', to: 'au' };
const join = (article: string, name: string) => (article.endsWith('’') ? article + name : `${article} ${name}`);

/** « point‑virgule ( ; ) », « tabulation », « caractère « § » ». */
export const separatorName = (char: string) => describe(char).name;

/** « le point‑virgule ( ; ) », « la tabulation », « l’espace ». */
export const theSeparator = (char: string) => join(describe(char).the, describe(char).name);

/** « au point‑virgule ( ; ) », « à la virgule ( , ) », « à l’espace ». */
export const toSeparator = (char: string) => join(describe(char).to, describe(char).name);

/** The shortcuts of the settings (MEM-80): the two usual ones, and the tab, which can't be typed in a field. */
export const SEPARATOR_SHORTCUTS = [
  { char: ';', label: ';' },
  { char: ',', label: ',' },
  { char: '\t', label: 'Tabulation' },
];

/** How the tab shows in the field of the settings, where it can't be typed. */
export const TAB_LABEL = 'Tab';

/** Why a separator can't be used, or null when it can (same rules as the API). */
export function separatorProblem(value: string): string | null {
  if (value === '') return 'Choisis un caractère.';
  if ([...value].length !== 1) return 'Un seul caractère.';
  if (value === '"') return 'Le guillemet ne peut pas servir de séparateur : il entoure les valeurs.';
  if (value === '\n' || value === '\r')
    return 'Le retour à la ligne ne peut pas servir de séparateur : il termine les lignes.';
  return null;
}

/** The largest file to import (MEM-53): 1 Mo. */
export const MAX_FILE_BYTES = 1_000_000;
