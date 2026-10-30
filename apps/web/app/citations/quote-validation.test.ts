import { describe, expect, it } from 'vitest';
import { quoteErrorsOf, quoteValuesOf } from './quote-validation';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe('the quote form (MEM-106)', () => {
  it('reads the four fields, trimmed, the recall hint included', () => {
    expect(quoteValuesOf(form({ text: ' Un texte ', hint: '  Un indice ', author: ' Moi ', source: '' }))).toEqual({
      text: 'Un texte',
      hint: 'Un indice',
      author: 'Moi',
      source: '',
    });
    expect(quoteValuesOf(form({ text: 'Un texte' })).hint).toBe('');
  });

  it('requires the recall hint, as the text', () => {
    expect(quoteErrorsOf({ text: 'Un texte', hint: '', author: '', source: '' })).toEqual({
      hint: 'Saisis l’indice de rappel de la citation.',
    });
    expect(quoteErrorsOf({ text: '', hint: '', author: '', source: '' })).toEqual({
      text: 'Saisis le texte de la citation.',
      hint: 'Saisis l’indice de rappel de la citation.',
    });
    expect(quoteErrorsOf({ text: 'Un texte', hint: 'Un indice', author: '', source: '' })).toEqual({});
  });

  it('refuses a recall hint longer than 300 characters', () => {
    expect(quoteErrorsOf({ text: 'Un texte', hint: 'x'.repeat(300), author: '', source: '' })).toEqual({});
    expect(quoteErrorsOf({ text: 'Un texte', hint: 'x'.repeat(301), author: '', source: '' })).toEqual({
      hint: '300 caractères au plus.',
    });
  });
});
