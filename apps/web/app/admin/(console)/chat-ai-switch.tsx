'use client';

import { useEffect, useRef, useState } from 'react';
import { setChatAiAction } from './actions';

type Status = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * MEM-144: the Chat IA of an account, as a switch saved at once: « … » while
 * it saves (no second click), « Enregistré ✓ » for a moment, or the error
 * and the previous state back.
 */
export function ChatAiSwitch({
  userId,
  label,
  enabled: initial,
  onChange,
}: {
  userId: string;
  /** The name, or else the e-mail: « Chat IA pour Ada Lovelace ». */
  label: string;
  enabled: boolean;
  /** The state saved, for the sort and the filter of the table. */
  onChange: (enabled: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState<Status>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function toggle() {
    if (status === 'saving') return;
    const next = !enabled;
    setEnabled(next);
    setStatus('saving');
    clearTimeout(timer.current);
    let ok = false;
    try {
      ok = (await setChatAiAction(userId, next)).ok;
    } catch {
      ok = false;
    }
    if (ok) {
      onChange(next);
      setStatus('saved');
      timer.current = setTimeout(() => setStatus('idle'), 3000);
    } else {
      setEnabled(!next); // back to the state saved
      setStatus('failed');
    }
  }

  return (
    <span className="chat-switch">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Chat IA pour ${label}`}
        aria-busy={status === 'saving' || undefined}
        disabled={status === 'saving'}
        className="chat-switch__button"
        onClick={() => void toggle()}
      >
        <span className="chat-switch__track" aria-hidden="true">
          <span className="chat-switch__thumb" />
        </span>
        <span className="chat-switch__state" aria-hidden="true">
          {enabled ? 'Activé' : 'Désactivé'}
        </span>
      </button>
      <span className="chat-switch__status" role="status">
        {status === 'saved' && <span className="chat-switch__saved">Enregistré ✓</span>}
        {status === 'failed' && <span className="chat-switch__failed">Échec de l’enregistrement : réessaie.</span>}
      </span>
    </span>
  );
}
