import { NBSP } from './format';

/**
 * How the items of a space are named in the messages: « 3 éléments ajoutés »
 * in the Anglais space, « 3 citations ajoutées » in the Citations space
 * (v0.12). Feminine nouns change the agreement of the participles.
 */
export interface Noun {
  one: string;
  many: string;
  feminine: boolean;
}

export const ITEM_NOUN: Noun = { one: 'élément', many: 'éléments', feminine: false };
export const QUOTE_NOUN: Noun = { one: 'citation', many: 'citations', feminine: true };

/** « 1 élément », « 12 citations », the number and its noun on a single line. */
export const countOf = (count: number, noun: Noun) => `${count}${NBSP}${count > 1 ? noun.many : noun.one}`;

/** A participle or an adjective agreed with the noun: « ajouté », « ajoutées »… */
export const agree = (word: string, noun: Noun, count: number) =>
  `${word}${noun.feminine ? 'e' : ''}${count > 1 ? 's' : ''}`;
