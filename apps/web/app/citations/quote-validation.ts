import { QUOTE_MAX, type QuoteField, type QuoteValues } from './quote-fields';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

/** The values of the quote form, trimmed. */
export const quoteValuesOf = (formData: FormData): QuoteValues => ({
  text: field(formData, 'text'),
  hint: field(formData, 'hint'),
  author: field(formData, 'author'),
  source: field(formData, 'source'),
});

/**
 * The text and the recall hint (MEM-106) are required; each field has the
 * length limit of the API. One message per field.
 */
export function quoteErrorsOf(values: QuoteValues): Partial<Record<QuoteField, string>> {
  const errors: Partial<Record<QuoteField, string>> = {};
  if (!values.text) errors.text = 'Saisis le texte de la citation.';
  if (!values.hint) errors.hint = 'Saisis l’indice de rappel de la citation.';
  for (const name of Object.keys(QUOTE_MAX) as QuoteField[]) {
    if (values[name].length > QUOTE_MAX[name]) errors[name] = `${QUOTE_MAX[name]} caractères au plus.`;
  }
  return errors;
}
