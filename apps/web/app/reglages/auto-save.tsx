'use client';

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SaveResult } from './save-result';

type Status = 'idle' | 'saving' | 'saved' | 'invalid' | 'failed';

/** How long « Enregistré ✓ » stays before it fades out. */
const SAVED_FOR_MS = 3000;

/**
 * MEM-79: a setting saved as soon as its change is confirmed, without an
 * « Enregistrer » button. `save` is a Server Action that takes the new value.
 * - The saves go one after the other, in the order of the changes: the last
 *   one wins on the server.
 * - An invalid value is not saved: the input stays as typed, with the
 *   message, to be corrected.
 * - A failed save (network, server) puts back the last saved value and
 *   offers to try again.
 * Only the last change speaks: an earlier save that ends later doesn't
 * overwrite the status of the latest one.
 */
export function useAutoSave<T>(initial: T, save: (value: T) => Promise<SaveResult>) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [failedValue, setFailedValue] = useState<T | null>(null);
  const [savedValue, setSavedValue] = useState(initial); // shown: is the input changed?
  const saved = useRef(initial); // the value the server has, for the saves in progress
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);

  const commit = useCallback(
    (next: T) => {
      setValue(next);
      const turn = ++latest.current;
      setStatus('saving');
      setMessage('');
      queue.current = queue.current.then(async () => {
        let result: SaveResult;
        try {
          result = await save(next);
        } catch {
          result = { failed: 'L’enregistrement a échoué.' }; // the network, or the server
        }
        if ('ok' in result) {
          saved.current = next;
          setSavedValue(next);
        }
        if (turn !== latest.current) return; // a later change has its own status
        if ('ok' in result) {
          setStatus('saved');
        } else if ('invalid' in result) {
          setStatus('invalid');
          setMessage(result.invalid);
        } else {
          setValue(saved.current);
          setFailedValue(next);
          setStatus('failed');
          setMessage(result.failed);
        }
      });
    },
    [save],
  );

  // « Enregistré ✓ » fades out after a few seconds.
  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), SAVED_FOR_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const retry = useCallback(() => {
    if (failedValue !== null) commit(failedValue);
  }, [failedValue, commit]);

  return { value, setValue, commit, status, message, retry, saved: savedValue };
}

/**
 * Next to a setting: « Enregistrement… », then « Enregistré ✓ » for a few
 * seconds; or why it wasn't saved, with « Réessayer » after a failure.
 * Announced to screen readers (a polite live region, always in the page).
 */
export function SaveStatus({
  status,
  message,
  onRetry,
  id,
}: {
  status: Status;
  message: string;
  onRetry: () => void;
  id?: string;
}) {
  return (
    <span className="save-status" id={id}>
      <span role="status" aria-live="polite" className={`save-status__text save-status--${status}`}>
        {status === 'saving' && 'Enregistrement…'}
        {status === 'saved' && 'Enregistré ✓'}
        {(status === 'invalid' || status === 'failed') && message}
      </span>
      {status === 'failed' && (
        <button type="button" className="link-button" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </span>
  );
}

/** A drop-down list saved at once, at the selection. */
export function AutoSelect<T extends string | number>({
  label,
  name,
  initial,
  options,
  save,
}: {
  label: ReactNode;
  name: string;
  initial: T;
  options: { value: T; label: string }[];
  save: (value: T) => Promise<SaveResult>;
}) {
  const field = useAutoSave(initial, save);
  const statusId = useId();
  return (
    <div className="settings__field">
      <label>
        {label}
        <select
          name={name}
          value={String(field.value)}
          aria-describedby={statusId}
          onChange={(event) => {
            const chosen = options.find((option) => String(option.value) === event.target.value);
            if (chosen) field.commit(chosen.value);
          }}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <SaveStatus id={statusId} status={field.status} message={field.message} onRetry={field.retry} />
    </div>
  );
}

/** A check box saved at once, when it is checked or unchecked. */
export function AutoCheckbox({
  label,
  name,
  initial,
  save,
}: {
  label: ReactNode;
  name: string;
  initial: boolean;
  save: (value: boolean) => Promise<SaveResult>;
}) {
  const field = useAutoSave(initial, save);
  const statusId = useId();
  return (
    <div className="settings__field">
      <label className="settings__check">
        <input
          type="checkbox"
          name={name}
          checked={field.value}
          aria-describedby={statusId}
          onChange={(event) => field.commit(event.target.checked)}
        />
        {label}
      </label>
      <SaveStatus id={statusId} status={field.status} message={field.message} onRetry={field.retry} />
    </div>
  );
}

/**
 * A text field (or a number, an hour…) saved on Enter or when the focus
 * leaves it, only when its value changed. An invalid value stays as typed,
 * with the message next to it (aria-invalid).
 */
export function AutoText({
  label,
  name,
  initial,
  save,
  type = 'text',
  ...props
}: {
  label: ReactNode;
  name: string;
  initial: string;
  save: (value: string) => Promise<SaveResult>;
  type?: 'text' | 'number' | 'time' | 'email';
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'value' | 'onChange'>) {
  const field = useAutoSave(initial, save);
  const statusId = useId();
  const confirm = () => {
    if (field.value !== field.saved) field.commit(field.value);
  };
  return (
    <div className="settings__field">
      <label>
        {label}
        <input
          {...props}
          type={type}
          name={name}
          value={field.value}
          aria-invalid={field.status === 'invalid' || undefined}
          aria-describedby={statusId}
          onChange={(event) => field.setValue(event.target.value)}
          onBlur={confirm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </label>
      <SaveStatus id={statusId} status={field.status} message={field.message} onRetry={field.retry} />
    </div>
  );
}
