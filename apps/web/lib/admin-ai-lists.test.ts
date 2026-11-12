import { describe, expect, it } from 'vitest';
import { formatDay, formatMonth, generationsError, totalsOf, userHref } from './admin-ai-lists';

describe('« Générer avec l’IA » in the console (MEM-143)', () => {
  it('the generations per day: a whole number from 1 to 200', () => {
    expect(generationsError('')).toBe('Saisis un nombre de générations.');
    expect(generationsError('  ')).toBe('Saisis un nombre de générations.');
    expect(generationsError('2.5')).toBe('Saisis un nombre entier.');
    expect(generationsError('-3')).toBe('Saisis un nombre entier.');
    expect(generationsError('0')).toBe('Saisis un nombre entre 1 et 200.');
    expect(generationsError('201')).toBe('Saisis un nombre entre 1 et 200.');
    expect(generationsError(' 1 ')).toBeNull();
    expect(generationsError('200')).toBeNull();
  });

  it('the days, the month, the totals, the « fiche » of a user', () => {
    expect(formatDay('2026-11-12')).toBe('jeu. 12 nov.');
    expect(formatMonth('2026-11')).toBe('novembre 2026');
    const day = { activeUsers: 1, generations: 2, proposed: 20, added: 5, inputTokens: 100, outputTokens: 400 };
    expect(
      totalsOf([
        { day: '2026-11-12', ...day },
        { day: '2026-11-11', ...day, generations: 1 },
      ]),
    ).toEqual({
      generations: 3,
      proposed: 40,
      added: 10,
      inputTokens: 200,
      outputTokens: 800,
    });
    expect(userHref('a+b@example.com')).toBe('/admin?recherche=a%2Bb%40example.com');
  });
});
