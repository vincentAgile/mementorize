import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuoteFields } from './quote-fields';

const values = { text: 'Un texte', hint: 'Un indice', author: 'Moi', source: 'Ici' };
const render = (props: Partial<Parameters<typeof QuoteFields>[0]> = {}) =>
  renderToStaticMarkup(<QuoteFields values={values} idPrefix="t" authors={[]} {...props} />);

describe('QuoteFields (MEM-106)', () => {
  it('puts the recall hint right under the text, before the author and the source', () => {
    const names = [...render().matchAll(/name="(\w+)"/g)].map((match) => match[1]);
    expect(names).toEqual(['text', 'hint', 'author', 'source']);
  });

  it('marks the recall hint as required, prefilled, with its help and its limit', () => {
    const html = render();
    const hint = html.match(/<textarea[^>]*name="hint"[^>]*>[^<]*<\/textarea>/)![0];
    expect(hint).toContain('aria-required="true"');
    expect(hint).toContain('>Un indice</textarea>');
    expect(hint).toContain('maxLength="300"');
    expect(hint).toContain('aria-describedby="t-hint-help"');
    expect(html).toContain('Indice de rappel');
    expect(html).toContain('id="t-hint-help"');
    expect(html).toContain('Citation relative à l’importance de la culture générale');
  });

  it('takes the recall hint on several lines, as the text', () => {
    const html = render({ values: { ...values, hint: 'Première ligne\nSeconde ligne' } });
    expect(html).toMatch(/<textarea[^>]*name="hint"[^>]*rows="2"[^>]*>/);
    expect(html).toContain('>Première ligne\nSeconde ligne</textarea>');
  });

  it('shows its error under it, tied to the field', () => {
    const html = render({ errors: { hint: 'Saisis l’indice de rappel de la citation.' } });
    const hint = html.match(/<textarea[^>]*name="hint"[^>]*>[^<]*<\/textarea>/)![0];
    expect(hint).toContain('aria-invalid="true"');
    expect(hint).toContain('aria-describedby="t-hint-help t-hint-error"');
    expect(html).toContain(
      '<span id="t-hint-error" class="field-error">Saisis l’indice de rappel de la citation.</span>',
    );
  });
});
