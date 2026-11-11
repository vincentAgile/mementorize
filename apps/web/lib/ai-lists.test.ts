import { describe, expect, it } from 'vitest';
import { fewerText, fieldError, readSettings, refusalText, remainingText, settingsSummary, themeOf } from './ai-lists';

const nb = (text: string) => text.replace(/ /g, ' ');

describe('« Générer avec l’IA »: the words of the screens (MEM-140/141)', () => {
  it('the generations left, the summary, the fewer cards', () => {
    expect(nb(remainingText(7))).toBe('7 générations restantes aujourd’hui');
    expect(nb(remainingText(1))).toBe('1 génération restante aujourd’hui');
    expect(nb(remainingText(0))).toBe('0 génération restante aujourd’hui');
    const settings = readSettings(null);
    expect(nb(settingsSummary({ ...settings, theme: null, customTheme: '  le football ' }))).toBe(
      'B1 · le football · 10 cartes',
    );
    expect(nb(fewerText(7, 3))).toBe('7 cartes proposées : 3 étaient déjà dans ta liste.');
    expect(nb(fewerText(1, 1))).toBe('1 carte proposée : 1 était déjà dans ta liste.');
    expect(nb(fewerText(4, 0))).toBe('4 cartes proposées.');
  });

  it('the theme sent: the predefined one, or the free one trimmed', () => {
    expect(themeOf(readSettings(null))).toBe('Vie quotidienne');
    expect(themeOf({ ...readSettings(null), theme: null, customTheme: '   ' })).toBe('');
  });

  it('the checks of a field corrected, as a card added by hand', () => {
    expect(fieldError('english', ' ')).toBe('Saisis le mot, l’expression ou la phrase en anglais.');
    expect(fieldError('french', '')).toBe('Saisis la traduction en français.');
    expect(fieldError('example', '')).toBeNull();
    expect(nb(fieldError('english', 'a'.repeat(201))!)).toBe('200 caractères au plus.');
    expect(fieldError('english', 'a'.repeat(200))).toBeNull();
    expect(nb(fieldError('frenchExample', 'a'.repeat(501))!)).toBe('500 caractères au plus.');
  });

  it('the refusals of the API', () => {
    expect(refusalText(429, { reason: 'daily-limit' })).toBe(
      'Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.',
    );
    expect(refusalText(409, null)).toMatch(/déjà en cours/);
    expect(refusalText(503, null)).toMatch(/occupée/);
    expect(refusalText(502, null)).toBe('L’IA n’a pas répondu : réessaie.');
  });

  it('a storage that throws: the defaults', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSettings(broken)).toEqual(readSettings(null));
  });
});
