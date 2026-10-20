/**
 * The letters of the avatar (MEM-9): the initials of the first and last
 * words of the name, or its first letter when it is a single word; without
 * a name, the first letter of the e-mail. Always in capitals.
 */
export function initialsOf(email: string, name?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return firstLetter(email);
  }
  if (words.length === 1) {
    return firstLetter(words[0]);
  }
  return firstLetter(words[0]) + firstLetter(words[words.length - 1]);
}

// Array.from splits by code points: an accented or non-Latin letter stays whole.
const firstLetter = (text: string) => (Array.from(text)[0] ?? '?').toLocaleUpperCase('fr');
