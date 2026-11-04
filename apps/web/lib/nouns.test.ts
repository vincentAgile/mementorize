import { describe, expect, it } from 'vitest';
import { agree, countOf, ITEM_NOUN, QUOTE_NOUN } from './nouns';

const plain = (text: string) => text.replace(/ /g, ' ');

describe('The names of the items (MEM-120: « carte » in the Anglais space)', () => {
  it('the Anglais space says « carte », feminine', () => {
    expect(ITEM_NOUN).toEqual({ one: 'carte', many: 'cartes', feminine: true });
  });

  it('counts and agreements, in the singular and the plural', () => {
    const said = (count: number, word: string) =>
      plain(`${countOf(count, ITEM_NOUN)} ${agree(word, ITEM_NOUN, count)}`);
    expect(said(1, 'ajouté')).toBe('1 carte ajoutée');
    expect(said(3, 'ajouté')).toBe('3 cartes ajoutées');
    expect(said(12, 'supprimé')).toBe('12 cartes supprimées');
    expect(said(2, 'sélectionné')).toBe('2 cartes sélectionnées');
    expect(plain(countOf(0, ITEM_NOUN))).toBe('0 carte');
    expect(agree('présent', ITEM_NOUN, 1)).toBe('présente');
    expect(agree('présent', ITEM_NOUN, 5)).toBe('présentes');
  });

  it('the Citations space is unchanged', () => {
    expect(plain(`${countOf(2, QUOTE_NOUN)} ${agree('importé', QUOTE_NOUN, 2)}`)).toBe('2 citations importées');
  });
});
