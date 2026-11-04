import { NBSP } from './format';

/**
 * How the items of a space are named in the messages: « 3 cartes ajoutées »
 * in the Anglais space, « 3 citations ajoutées » in the Citations space
 * (v0.12). Feminine nouns change the agreement of the participles.
 * MEM-120: the Anglais space says « carte », as the referential of the
 * project (MEMENTORIZE.md §4), and no longer « élément »; a test keeps that
 * word out of the interface (vocabulary-guard.test.ts).
 */
export interface Noun {
  one: string;
  many: string;
  feminine: boolean;
}

export const ITEM_NOUN: Noun = { one: 'carte', many: 'cartes', feminine: true };
export const QUOTE_NOUN: Noun = { one: 'citation', many: 'citations', feminine: true };

/** « 1 carte », « 12 citations », the number and its noun on a single line. */
export const countOf = (count: number, noun: Noun) => `${count}${NBSP}${count > 1 ? noun.many : noun.one}`;

/** A participle or an adjective agreed with the noun: « ajouté », « ajoutées »… */
export const agree = (word: string, noun: Noun, count: number) =>
  `${word}${noun.feminine ? 'e' : ''}${count > 1 ? 's' : ''}`;
