'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fieldError, type RowField } from '../../../../lib/ai-lists';

/**
 * MEM-141: a text of a row of the preview, corrected in place: a click (or
 * Enter) opens a field; Enter or leaving it keeps the text, Escape gives the
 * former one back. A wrong text (empty, too long) is never kept: the field
 * stays open with its error under it, as in the « Ajouter une carte » tab.
 */
export function EditableCell({
  value,
  field,
  label,
  lang,
  multiline = false,
  empty,
  onCommit,
  disabled = false,
}: {
  value: string;
  field: RowField;
  /** What the field is, for screen readers: « Anglais de “a ticket” ». */
  label: string;
  lang: 'en' | 'fr';
  multiline?: boolean;
  /** Shown when there is no text (an example): what a click adds. */
  empty?: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const backToButton = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (backToButton.current) {
      backToButton.current = false;
      button.current?.focus();
    }
  }, [editing]);

  function open() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  /** Keeps the text when it is right; else the field stays open with its error. */
  function commit(refocus: boolean) {
    const problem = fieldError(field, draft);
    if (problem) {
      setError(problem);
      if (refocus) input.current?.focus();
      return;
    }
    const text = draft.trim();
    if (text !== value) onCommit(text);
    backToButton.current = refocus;
    setEditing(false);
  }

  function cancel() {
    backToButton.current = true;
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        ref={button}
        type="button"
        className={`ai-cell${value ? '' : ' is-empty'}`}
        lang={value ? lang : undefined}
        aria-label={`${label} : ${value || 'vide'}. Modifier`}
        onClick={open}
        disabled={disabled}
      >
        {value || empty}
      </button>
    );
  }

  const props = {
    ref: input,
    className: 'ai-cell__input',
    value: draft,
    lang,
    'aria-label': label,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onChange: (event: { target: { value: string } }) => {
      setDraft(event.target.value);
      if (error) setError(fieldError(field, event.target.value));
    },
    onBlur: () => commit(false),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commit(true);
      }
    },
  };
  return (
    <span className="ai-cell__edit">
      {multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </span>
  );
}
