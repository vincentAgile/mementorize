import type { Profile } from './types';

const firstLetter = (text: string) => (Array.from(text.trim())[0] ?? '?').toLocaleUpperCase('fr');

/**
 * The letters of the avatar (MEM-9, MEM-11): the first letter of the first
 * name and of the last name; with only one of them, its first letter;
 * without either, the first letter of the e-mail. Always in capitals.
 * (Array.from splits by code points: an accented letter stays whole.)
 */
export function initialsOf({ email, firstName, lastName }: Profile): string {
  const parts = [firstName, lastName].filter((part): part is string => !!part?.trim());
  return parts.length > 0 ? parts.map(firstLetter).join('') : firstLetter(email);
}

/** "Prénom Nom", or whichever is filled in; null when neither is. */
export function fullNameOf({ firstName, lastName }: Profile): string | null {
  return [firstName, lastName].filter(Boolean).join(' ') || null;
}
