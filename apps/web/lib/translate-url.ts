import type { Translator } from './types';

export type Language = 'en' | 'fr';

/** The names shown on the buttons and in the settings (MEM-44). */
export const TRANSLATOR_NAMES: Record<Translator, string> = {
  DeepL: 'DeepL',
  Google: 'Google Traduction',
};

/**
 * Address of the translation of `text` from one language to the other, on
 * the chosen service (MEM-44). DeepL reads the text after a #, where a « / »
 * would end it: it expects them escaped with a backslash (and the
 * backslashes themselves doubled), then URL-encoded.
 */
export function translateUrl(translator: Translator, from: Language, text: string): string {
  const to: Language = from === 'en' ? 'fr' : 'en';
  if (translator === 'Google') {
    const query = new URLSearchParams({ sl: from, tl: to, text, op: 'translate' });
    return `https://translate.google.com/?${query.toString().replace(/\+/g, '%20')}`;
  }
  const escaped = text.replace(/\\/g, '\\\\').replace(/\//g, '\\/');
  return `https://www.deepl.com/translator#${from}/${to}/${encodeURIComponent(escaped)}`;
}
