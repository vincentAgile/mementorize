'use client';

import { useEffect, useRef, useState } from 'react';
import { type Language, TRANSLATOR_NAMES, translateUrl } from '../../lib/translate-url';
import type { Translator } from '../../lib/types';

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
  /** The service of the translate buttons (MEM-44), chosen in the settings. */
  translator: Translator;
}

/**
 * The fields of a vocabulary item, in two blocks side by side on a
 * computer, one under the other on a phone. Shared by the "Ajouter" tab
 * (MEM-27) and the edit form of the list (MEM-19). Each field has its
 * translate button (MEM-44).
 */
export function VocabularyFields({ values, errors, idPrefix, autoFocus = false, translator }: VocabularyFieldsProps) {
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
                <TranslatedInput
                  translator={translator}
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

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { lang: Language; defaultValue: string };

/**
 * A field and its translate button (MEM-44), which opens DeepL or Google
 * Translate in a new tab, with the text of the field, towards the other
 * language. The field stays uncontrolled (the forms rely on that); the
 * button follows its text: what is typed, and the form being reset after
 * an action (React empties it, or refills it after an error).
 */
function TranslatedInput({ translator, lang, defaultValue, ...props }: InputProps & { translator: Translator }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue);

  useEffect(() => {
    const form = input.current?.form;
    // The reset event comes before the fields are refilled: read them just after.
    const sync = () => setTimeout(() => setText(input.current?.value ?? ''));
    form?.addEventListener('reset', sync);
    return () => form?.removeEventListener('reset', sync);
  }, []);

  const trimmed = text.trim();
  const target = lang === 'en' ? 'français' : 'anglais';
  const label = `Traduire en ${target} avec ${TRANSLATOR_NAMES[translator]}`;

  return (
    <span className="vocab-fields__control">
      <input
        ref={input}
        lang={lang}
        defaultValue={defaultValue}
        onInput={(e) => setText(e.currentTarget.value)}
        {...props}
      />
      {trimmed ? (
        <a
          className="translate-button"
          href={translateUrl(translator, lang, trimmed)}
          target="_blank"
          rel="noopener noreferrer"
          // Out of the Tab order: the keyboard goes from field to field, as
          // MEM-43 asks, for a fast entry. With the mouse, a finger, or a
          // screen reader's list of links, the button is there.
          tabIndex={-1}
          title={`${label} (nouvel onglet)`}
        >
          <TranslateIcon />
          <span className="visually-hidden">{label} (nouvel onglet)</span>
        </a>
      ) : (
        // Nothing to translate yet: a placeholder, out of the Tab order.
        <span className="translate-button translate-button--off" title="Saisis un texte à traduire" aria-hidden="true">
          <TranslateIcon />
        </span>
      )}
    </span>
  );
}

/** Two speech bubbles, A and 文: a translation. Decorative. */
function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M3.5 4.5h9v7h-5l-3 2.5v-2.5h-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 9.7 8 5.8l1.8 3.9M6.8 8.4h2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 12.5h9v7h-1v2.5l-3-2.5h-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 15h5M16.5 14v1M18 15c-.4 1.6-1.6 2.8-3.4 3.4M15.2 16.3c.6.9 1.6 1.6 2.9 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
