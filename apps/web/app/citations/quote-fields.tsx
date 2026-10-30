export type QuoteField = 'text' | 'hint' | 'author' | 'source';
export type QuoteValues = Record<QuoteField, string>;

/** Same limits as the API (CreateQuoteDto). */
export const QUOTE_MAX: Record<QuoteField, number> = { text: 2000, hint: 300, author: 200, source: 300 };

interface QuoteFieldsProps {
  values: QuoteValues;
  /** One message per field, shown under it. */
  errors?: Partial<Record<QuoteField, string>>;
  /** Makes the ids unique in the page (several forms). */
  idPrefix: string;
  /** The cursor in the text when the form appears (the "Ajouter" tab, MEM-71). */
  autoFocus?: boolean;
  /** The authors already entered, suggested by the author field (MEM-71). */
  authors: string[];
}

/**
 * The fields of a quote: its text and its recall hint (both required,
 * MEM-106), its author and its source.
 * Shared by the "Ajouter" tab (MEM-71) and the edit form of the list
 * (MEM-69). Errors show under their field (aria-invalid, aria-describedby).
 */
export function QuoteFields({ values, errors, idPrefix, autoFocus = false, authors }: QuoteFieldsProps) {
  const described = (field: QuoteField) =>
    errors?.[field] ? { 'aria-invalid': true as const, 'aria-describedby': `${idPrefix}-${field}-error` } : undefined;
  const hintError = errors?.hint ? ` ${idPrefix}-hint-error` : '';
  const error = (field: QuoteField) =>
    errors?.[field] && (
      <span id={`${idPrefix}-${field}-error`} className="field-error">
        {errors[field]}
      </span>
    );

  return (
    <div className="quote-fields">
      <label className="quote-fields__text">
        <span>
          Texte{' '}
          <span className="vocab-fields__required" aria-hidden="true">
            *
          </span>
        </span>
        <textarea
          name="text"
          rows={4}
          placeholder="Le texte de la citation"
          defaultValue={values.text}
          maxLength={QUOTE_MAX.text}
          aria-required
          autoFocus={autoFocus}
          {...described('text')}
        />
        {error('text')}
      </label>
      {/* MEM-106: what the quote is about, the question of its card in the review. */}
      <label className="quote-fields__hint">
        <span>
          Indice de rappel{' '}
          <span className="vocab-fields__required" aria-hidden="true">
            *
          </span>
        </span>
        <input
          name="hint"
          autoComplete="off"
          defaultValue={values.hint}
          maxLength={QUOTE_MAX.hint}
          aria-required
          aria-invalid={errors?.hint ? true : undefined}
          aria-describedby={`${idPrefix}-hint-help${hintError}`}
        />
        <span id={`${idPrefix}-hint-help`} className="field-help">
          Ce que la citation évoque, par exemple « Citation relative à l’importance de la culture générale ».
        </span>
        {error('hint')}
      </label>
      <label>
        <span>
          Auteur <span className="add-form__optional">(facultatif)</span>
        </span>
        <input
          name="author"
          // The authors already entered, as suggestions: « Pascal » rather than a new « B. Pascal ».
          list={`${idPrefix}-authors`}
          autoComplete="off"
          placeholder="Pascal, Montaigne…"
          defaultValue={values.author}
          maxLength={QUOTE_MAX.author}
          {...described('author')}
        />
        <datalist id={`${idPrefix}-authors`}>
          {authors.map((author) => (
            <option key={author} value={author} />
          ))}
        </datalist>
        {error('author')}
      </label>
      <label>
        <span>
          Source <span className="add-form__optional">(facultatif)</span>
        </span>
        <input
          name="source"
          placeholder="Œuvre, discours, film…"
          defaultValue={values.source}
          maxLength={QUOTE_MAX.source}
          {...described('source')}
        />
        {error('source')}
      </label>
    </div>
  );
}
