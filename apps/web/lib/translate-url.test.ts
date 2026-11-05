import { describe, expect, it } from 'vitest';
import { TRANSLATOR_CHOICES, TRANSLATOR_NAMES, translateUrl } from './translate-url';

describe('The translate buttons (MEM-44): the English of DeepL', () => {
  it('towards English: British English with « DeepL », American English with « DeepLAmerican »', () => {
    expect(translateUrl('DeepL', 'fr', 'un accroc')).toBe('https://www.deepl.com/translator#fr/en-gb/un%20accroc');
    expect(translateUrl('DeepLAmerican', 'fr', 'un accroc')).toBe(
      'https://www.deepl.com/translator#fr/en-us/un%20accroc',
    );
  });

  it('towards French: French, whatever the variant; the slashes escaped as before', () => {
    expect(translateUrl('DeepL', 'en', 'a snag')).toBe('https://www.deepl.com/translator#en/fr/a%20snag');
    expect(translateUrl('DeepLAmerican', 'en', 'and/or')).toBe('https://www.deepl.com/translator#en/fr/and%5C%2For');
  });

  it('Google: unchanged', () => {
    expect(translateUrl('Google', 'fr', 'un accroc')).toBe(
      'https://translate.google.com/?sl=fr&tl=en&text=un%20accroc&op=translate',
    );
  });

  it('the settings: three choices; the buttons still say « DeepL »', () => {
    expect(TRANSLATOR_CHOICES.map((choice) => choice.label)).toEqual([
      'DeepL - Anglais britannique',
      'DeepL - Anglais américain',
      'Google Traduction',
    ]);
    expect(TRANSLATOR_NAMES.DeepLAmerican).toBe('DeepL');
  });
});
