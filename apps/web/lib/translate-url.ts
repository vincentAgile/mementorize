import type { Translator } from './types';

export type Language = 'en' | 'fr';

/** The names shown on the buttons (MEM-44): « Traduire en anglais avec DeepL ». */
export const TRANSLATOR_NAMES: Record<Translator, string> = {
  DeepL: 'DeepL',
  DeepLAmerican: 'DeepL',
  Google: 'Google Traduction',
};

/** The choices of the settings, with the English of DeepL: British (the former « DeepL ») or American. */
export const TRANSLATOR_CHOICES: { value: Translator; label: string }[] = [
  { value: 'DeepL', label: 'DeepL - Anglais britannique' },
  { value: 'DeepLAmerican', label: 'DeepL - Anglais américain' },
  { value: 'Google', label: 'Google Traduction' },
];

/** DeepL's codes of the target language: English as British or American English. */
const DEEPL_TARGET = {
  en: { DeepL: 'en-gb', DeepLAmerican: 'en-us' },
  fr: { DeepL: 'fr', DeepLAmerican: 'fr' },
} as const;

/**
 * Address of the translation of `text` from one language to the other, on
 * the chosen service (MEM-44). DeepL reads the text after a #, where a « / »
 * would end it: it expects them escaped with a backslash (and the
 * backslashes themselves doubled), then URL-encoded. Towards English, DeepL
 * gets the variant chosen in the settings: British (en-gb) or American (en-us).
 */
export function translateUrl(translator: Translator, from: Language, text: string): string {
  const to: Language = from === 'en' ? 'fr' : 'en';
  if (translator === 'Google') {
    const query = new URLSearchParams({ sl: from, tl: to, text, op: 'translate' });
    return `https://translate.google.com/?${query.toString().replace(/\+/g, '%20')}`;
  }
  const escaped = text.replace(/\\/g, '\\\\').replace(/\//g, '\\/');
  return `https://www.deepl.com/translator#${from}/${DEEPL_TARGET[to][translator]}/${encodeURIComponent(escaped)}`;
}
