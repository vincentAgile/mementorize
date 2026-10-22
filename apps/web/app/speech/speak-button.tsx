'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { canPronounce, pronounce, subscribeToVoices } from '../../lib/speech';

/**
 * The loudspeaker button (MEM-37): reads the English text aloud, from the
 * start at each click. Hidden when the browser has no English voice (or no
 * speech synthesis). Shortcut: P. Only one is shown at a time on a card.
 * It doesn't stop the reading when it disappears: the card does, when it
 * changes (lib/speech.ts, stopPronouncing).
 */
export function SpeakButton({ text }: { text: string }) {
  // Unknown on the server (false); in the browser, follows the list of voices.
  const available = useSyncExternalStore(subscribeToVoices, canPronounce, () => false);

  useEffect(() => {
    if (!available) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        pronounce(text);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [available, text]);

  if (!available) return null;
  return (
    <button
      type="button"
      className="speak-button"
      aria-label="Écouter la prononciation"
      title="Écouter la prononciation (P)"
      onClick={() => pronounce(text)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** A line of English with its loudspeaker button on the right. */
export function Speakable({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="speakable">
      {children}
      <SpeakButton text={text} />
    </div>
  );
}
