export type VocabularyField = 'word' | 'example' | 'translation' | 'frenchExample';

export type VocabularyValues = Record<VocabularyField, string>;

interface FieldSpec {
  name: VocabularyField;
  label: string;
  required: boolean;
  lang: 'en' | 'fr';
  placeholder: string;
  maxLength: number;
}

/**
 * The two blocks of a vocabulary item (MEM-43): Anglais (the item, its
 * example) and Français (the translation, its example, MEM-42). In this
 * order in the page, which is the order of the Tab key: English item →
 * English example → translation → French example. Each field has its
 * language, for the browser's spelling checker.
 */
const BLOCKS: { title: string; lang: 'en' | 'fr'; fields: FieldSpec[] }[] = [
  {
    title: 'Anglais',
    lang: 'en',
    fields: [
      {
        name: 'word',
        label: 'Mot ou expression',
        required: true,
        lang: 'en',
        placeholder: 'Mot, expression ou phrase',
        maxLength: 200,
      },
      {
        name: 'example',
        label: 'Phrase d’exemple',
        required: false,
        lang: 'en',
        placeholder: 'Une phrase qui l’emploie',
        maxLength: 500,
      },
    ],
  },
  {
    title: 'Français',
    lang: 'fr',
    fields: [
      {
        name: 'translation',
        label: 'Traduction',
        required: true,
        lang: 'fr',
        placeholder: 'Traduction',
        maxLength: 200,
      },
      {
        name: 'frenchExample',
        label: 'Phrase d’exemple',
        required: false,
        lang: 'fr',
        placeholder: 'La même phrase, en français',
        maxLength: 500,
      },
    ],
  },
];

interface VocabularyFieldsProps {
  values: VocabularyValues;
  /** One message per field, shown under it. */
  errors?: Partial<Record<VocabularyField, string>>;
  /** Makes the ids of the error messages unique in the page (several forms). */
  idPrefix: string;
  /** The cursor in the first field when the form appears (the "Ajouter" tab, MEM-27). */
  autoFocus?: boolean;
}

/**
 * The fields of a vocabulary item, in two blocks side by side on a
 * computer, one under the other on a phone. Shared by the "Ajouter" tab
 * (MEM-27) and the edit form of the list (MEM-19).
 */
export function VocabularyFields({ values, errors, idPrefix, autoFocus = false }: VocabularyFieldsProps) {
  return (
    <div className="vocab-fields">
      {BLOCKS.map((block) => (
        <fieldset key={block.title} className="vocab-fields__block">
          <legend>{block.title}</legend>
          {block.fields.map((field, index) => {
            const error = errors?.[field.name];
            const errorId = `${idPrefix}-${field.name}-error`;
            return (
              <label key={field.name}>
                <span>
                  {field.label}{' '}
                  {field.required ? (
                    <span className="vocab-fields__required" aria-hidden="true">
                      *
                    </span>
                  ) : (
                    <span className="add-form__optional">(facultatif)</span>
                  )}
                </span>
                <input
                  name={field.name}
                  lang={field.lang}
                  placeholder={field.placeholder}
                  defaultValue={values[field.name]}
                  maxLength={field.maxLength}
                  aria-required={field.required || undefined}
                  autoFocus={autoFocus && block.lang === 'en' && index === 0}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                />
                {error && (
                  <span id={errorId} className="field-error">
                    {error}
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
