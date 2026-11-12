import { describe, expect, it } from 'vitest';
import { boundedError, formatDay, formatMonth, generationsError, userHref } from './admin-ai-lists';

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

  it('any bounded number of the console (MEM-135)', () => {
    expect(boundedError('', 30, 300, 'Saisis un nombre de mots.')).toBe('Saisis un nombre de mots.');
    expect(boundedError('29', 30, 300, '')).toBe('Saisis un nombre entre 30 et 300.');
    expect(boundedError('300', 30, 300, '')).toBeNull();
  });

  it('the days, the month, the « fiche » of a user', () => {
    expect(formatDay('2026-11-12')).toBe('jeu. 12 nov.');
    expect(formatMonth('2026-11')).toBe('novembre 2026');
    expect(userHref('a+b@example.com')).toBe('/admin?recherche=a%2Bb%40example.com');
  });
});
