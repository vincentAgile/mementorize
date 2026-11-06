'use client';

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  azureRecognizer,
  CONNECTION_LOST,
  fetchSpeechToken,
  insertSpoken,
  MAX_RECORDING_MS,
  microphoneError,
  type RecognitionSession,
  type Recognizer,
  sameText,
  SILENCE_MS,
  type SpeechToken,
  type SpokenPronunciation,
  summarizePronunciation,
  type UtteranceScores,
  VOICE_UNAVAILABLE,
} from '../../../lib/voice-input';

/** What the microphone needs; replaced in the tests. */
export interface VoiceInputDeps {
  recognizer?: Recognizer;
  getMicrophone?: () => Promise<MediaStream>;
  getToken?: () => Promise<SpeechToken | { error: string }>;
}

/** The text being said, put in the input at its place: it grows as the speaker talks. */
interface Segment {
  /** Where it is in the input. */
  start: number;
  /** Its length in the input, spaces around included. */
  length: number;
  /** Its sentences already final. */
  finals: string[];
}

export type VoicePhase = 'idle' | 'starting' | 'listening';

/**
 * MEM-133: speaking instead of typing. The text heard appears in the input
 * at the place of the cursor, without removing what is typed; the input
 * stays editable. The recording stops on a second click, after 2 minutes, or
 * 8 seconds without speech. The pronunciation measured goes with the
 * message only if its text is exactly the one recognized.
 */
export function useVoiceInput({
  textarea,
  input,
  setInput,
  onStart,
  deps = {},
}: {
  textarea: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  /** At the start of a recording: the reading of the AI is cut (no echo). */
  onStart: () => void;
  deps?: VoiceInputDeps;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<{ message: string; resume: boolean } | null>(null);

  const value = useRef(input);
  useLayoutEffect(() => {
    value.current = input;
  }, [input]);
  const session = useRef<RecognitionSession | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const segment = useRef<Segment | null>(null);
  /** Every sentence recognized for the message being written, and their pronunciation. */
  const finals = useRef<string[]>([]);
  const scores = useRef<UtteranceScores[]>([]);
  const timers = useRef<{ max?: ReturnType<typeof setTimeout>; silence?: ReturnType<typeof setTimeout> }>({});
  const meter = useRef<{ context?: AudioContext; frame?: number }>({});

  const write = useCallback(
    (spoken: string) => {
      const current = value.current;
      if (!segment.current) {
        const caret = textarea.current?.selectionEnd ?? current.length;
        segment.current = { start: Math.min(caret, current.length), length: 0, finals: [] };
      }
      const seg = segment.current;
      const without = current.slice(0, seg.start) + current.slice(seg.start + seg.length);
      const { value: next, inserted } = insertSpoken(without, seg.start, spoken);
      seg.length = inserted.length;
      value.current = next;
      setInput(next);
    },
    [setInput, textarea],
  );

  const stop = useCallback(async () => {
    clearTimeout(timers.current.max);
    clearTimeout(timers.current.silence);
    const running = session.current;
    session.current = null;
    await running?.stop().catch(() => undefined);
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (meter.current.frame !== undefined) cancelAnimationFrame(meter.current.frame);
    void meter.current.context?.close().catch(() => undefined);
    meter.current = {};
    setLevel(0);
    setPhase('idle');
  }, []);

  const quiet = useCallback(() => {
    clearTimeout(timers.current.silence);
    timers.current.silence = setTimeout(() => void stop(), SILENCE_MS);
  }, [stop]);

  /** The level of the voice, for the indicator: 0 to 1. */
  const listenToLevel = useCallback((media: MediaStream) => {
    if (typeof AudioContext === 'undefined') return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(media).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        meter.current.frame = requestAnimationFrame(tick);
      };
      meter.current = { context, frame: requestAnimationFrame(tick) };
    } catch {
      // No indicator: the recording works without it.
    }
  }, []);

  const start = useCallback(async () => {
    if (session.current) return;
    onStart();
    setError(null);
    setPhase('starting');
    const token = await (deps.getToken ?? fetchSpeechToken)();
    if ('error' in token) {
      setError({ message: token.error, resume: false });
      setPhase('idle');
      return;
    }
    let media: MediaStream;
    try {
      media = await (deps.getMicrophone ?? (() => navigator.mediaDevices.getUserMedia({ audio: true })))();
    } catch (cause) {
      setError({ message: microphoneError(cause), resume: false });
      setPhase('idle');
      return;
    }
    stream.current = media;
    segment.current = null; // the text goes at the cursor
    /** The recognition failed while it started: it doesn't go on. */
    let failed = false;
    try {
      session.current = await (deps.recognizer ?? azureRecognizer)(media, token, {
        onInterim: (text) => {
          quiet();
          write([...(segment.current?.finals ?? []), text].join(' '));
        },
        onFinal: (text, measured) => {
          quiet();
          if (!segment.current) write('');
          segment.current!.finals.push(text);
          finals.current.push(text);
          if (measured) scores.current.push(measured);
          write(segment.current!.finals.join(' '));
        },
        onError: (kind) => {
          failed = true;
          void stop();
          setError(
            kind === 'connection'
              ? { message: CONNECTION_LOST, resume: true }
              : { message: VOICE_UNAVAILABLE, resume: false },
          );
        },
      });
    } catch {
      for (const track of media.getTracks()) track.stop();
      stream.current = null;
      setError({ message: VOICE_UNAVAILABLE, resume: false });
      setPhase('idle');
      return;
    }
    if (failed) {
      void stop();
      return;
    }
    setPhase('listening');
    listenToLevel(media);
    timers.current.max = setTimeout(() => void stop(), MAX_RECORDING_MS);
    quiet();
  }, [deps, listenToLevel, onStart, quiet, stop, write]);

  // Leaving the page: the microphone is released.
  useEffect(() => () => void stop(), [stop]);

  return {
    phase,
    level,
    error,
    start,
    stop,
    /** The user typed: the next words heard go to the cursor, not in the middle of their edit. */
    typed: useCallback(() => {
      segment.current = null;
    }, []),
    /** The pronunciation to send with this text: only if it is exactly the one recognized. */
    pronunciationFor: useCallback((text: string): SpokenPronunciation | null => {
      if (finals.current.length === 0 || !sameText(text, finals.current.join(' '))) return null;
      return summarizePronunciation(scores.current);
    }, []),
    /** The message is sent: what was said is forgotten. */
    reset: useCallback(() => {
      finals.current = [];
      scores.current = [];
      segment.current = null;
      setError(null);
    }, []),
  };
}

/** The microphone button, next to « Envoyer »: « Parler », then « Arrêter ». */
export function MicButton({
  phase,
  onClick,
  disabled,
}: {
  phase: VoicePhase;
  onClick: () => void;
  disabled?: boolean;
}) {
  const listening = phase === 'listening';
  return (
    <button
      type="button"
      className={`chat__mic${listening ? ' chat__mic--on' : ''}`}
      aria-pressed={listening}
      aria-label={listening ? 'Arrêter l’enregistrement' : 'Parler'}
      title={listening ? 'Arrêter' : 'Parler (en anglais)'}
      onClick={onClick}
      disabled={disabled || phase === 'starting'}
    >
      {listening ? (
        <>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
          <span>Arrêter</span>
        </>
      ) : (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path
            d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
