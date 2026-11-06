'use client';

import { useSyncExternalStore } from 'react';
import { type ChatVoice, sentencesOf } from '../../../lib/chat-voice';

/**
 * MEM-132: the loudspeaker of a message of the AI (the style of the
 * pronunciation buttons of the cards): reads it, sentence by sentence; a
 * new click while it is read stops it. With `label` (« Écouter »), shown
 * with its text: the opening question the browser didn't let read on arrival.
 */
export function ChatSpeakButton({
  voice,
  readingKey,
  text,
  url,
  label,
  title = 'Écouter',
  onPlay,
}: {
  voice: ChatVoice;
  readingKey: string;
  text: string;
  /** An audio prepared in advance (the opening question). */
  url?: string;
  label?: string;
  title?: string;
  onPlay?: () => void;
}) {
  const reading = useSyncExternalStore(voice.subscribe, voice.owner, () => null) === readingKey;

  function toggle() {
    if (reading) {
      voice.stop();
      return;
    }
    onPlay?.();
    void voice.speak(readingKey, url ? [{ text, url }] : sentencesOf(text));
  }

  return (
    <button
      type="button"
      className={`speak-button chat__speak${label ? ' speak-button--labeled chat__speak--hint' : ''}`}
      aria-pressed={reading}
      aria-label={label ? undefined : reading ? 'Arrêter la lecture' : title}
      title={reading ? 'Arrêter la lecture' : title}
      lang="fr"
      onClick={toggle}
    >
      {reading ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      ) : (
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
      )}
      {label}
    </button>
  );
}
