/**
 * The separator of the CSV files (MEM-80): any single character, chosen in
 * the settings, but the double quote (it surrounds the values) and the line
 * breaks (they end the lines). A tab is allowed; a space too.
 */
export const DEFAULT_SEPARATOR = ';';

/** The separators commonly found in CSV files: those offered when a file seems to use another one. */
export const COMMON_SEPARATORS = [';', ',', '\t', '|', ':'] as const;

/** Why a separator can't be used, or null when it can. */
export function separatorProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return 'Choisis un caractère.';
  if ([...value].length !== 1) return 'Un seul caractère.';
  if (value === '"') return 'Le guillemet ne peut pas servir de séparateur : il entoure les valeurs.';
  if (value === '\n' || value === '\r')
    return 'Le retour à la ligne ne peut pas servir de séparateur : il termine les lignes.';
  return null;
}
