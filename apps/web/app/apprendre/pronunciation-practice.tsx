'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  appreciation,
  failureMessage,
  type PronunciationResult,
  QUALITY_LABELS,
  wordQuality,
  weakSounds,
} from '../../lib/pronunciation-assessment';
import { PRONOUNCE_EVENT, stopPronouncing } from '../../lib/speech';

/** As the API (MEM-90): 10 seconds at most. */
const MAX_SECONDS = 10;
const CONSENT_KEY = 'mementorize.pronunciation.consent';

type State =
  | { name: 'idle' }
  | { name: 'consent' }
  | { name: 'recording'; startedAt: number }
  | { name: 'assessing' }
  | { name: 'result'; result: PronunciationResult }
  | { name: 'failed'; message: string };

const noop = () => () => undefined;
/** The browser can record: a microphone API and MediaRecorder. Unknown on the server. */
const canRecord = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

function consented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'yes');
  } catch {
    // private browsing: asked again next time
  }
}

const mmss = (ms: number) => `0:${String(Math.min(MAX_SECONDS, Math.floor(ms / 1000))).padStart(2, '0')}`;

/**
 * MEM-91: « Répéter », at step 1 of the learning: the user records
 * themselves saying the item they just heard, and sees how they pronounced
 * it (MEM-90). Optional: nothing waits for it, and the result has no effect
 * on the scheduling. One per item (keyed by the item): changing item stops
 * and forgets everything.
 */
export function usePronunciationPractice(itemId: string) {
  const supported = useSyncExternalStore(noop, canRecord, () => false);
  const [state, setState] = useState<State>({ name: 'idle' });
  const [denied, setDenied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** MEM-92: the last recording, to listen to it here, in the browser only. */
  const [playback, setPlayback] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);

  const stopPlayback = useCallback(() => {
    player.current?.pause();
    setPlaying(false);
  }, []);

  /** MEM-92: plays the user's recording; the reference stops. */
  const listen = useCallback(() => {
    if (!playback) return;
    stopPronouncing();
    if (!player.current) {
      player.current = new Audio();
      player.current.onended = () => setPlaying(false);
    }
    if (player.current.src !== playback) player.current.src = playback;
    player.current.currentTime = 0;
    void player.current.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [playback]);

  // The reference read (« Écouter »): the user's recording stops.
  useEffect(() => {
    window.addEventListener(PRONOUNCE_EVENT, stopPlayback);
    return () => window.removeEventListener(PRONOUNCE_EVENT, stopPlayback);
  }, [stopPlayback]);

  // MEM-92: the recording leaves the browser's memory with the item (next one, end of the session).
  useEffect(() => {
    return () => {
      player.current?.pause();
      player.current?.removeAttribute('src');
      if (playback) URL.revokeObjectURL(playback);
    };
  }, [playback]);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  // Leaving the item (or the session): stop recording, forget it, drop the request.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      request.current?.abort();
      release();
    };
  }, [release]);

  const send = useCallback(
    async (audio: Blob) => {
      setState({ name: 'assessing' });
      const controller = new AbortController();
      request.current = controller;
      try {
        const res = await fetch(`/prononciation/evaluation?itemId=${encodeURIComponent(itemId)}`, {
          method: 'POST',
          headers: { 'Content-Type': audio.type || 'audio/webm' },
          body: audio,
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as (PronunciationResult & { message?: string }) | null;
        if (!alive.current) return;
        if (res.ok && body) setState({ name: 'result', result: body });
        else setState({ name: 'failed', message: failureMessage(res.status, body?.message) });
      } catch {
        if (alive.current && !controller.signal.aborted) {
          setState({ name: 'failed', message: failureMessage(503) });
        }
      }
    },
    [itemId],
  );

  const start = useCallback(async () => {
    setDenied(false);
    stopPronouncing(); // the reference voice would be recorded too
    stopPlayback(); // and the user's previous recording
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (!alive.current) return;
      if ((error as DOMException).name === 'NotAllowedError' || (error as DOMException).name === 'SecurityError') {
        setDenied(true);
        setState({ name: 'idle' });
      } else {
        setState({ name: 'failed', message: 'Aucun micro n’est disponible sur cet appareil.' });
      }
      return;
    }
    if (!alive.current) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream.current = media;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(media);
    recorder.current = rec;
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = () => {
      release();
      recorder.current = null;
      if (!alive.current) return;
      const audio = new Blob(chunks, { type: rec.mimeType });
      setPlayback(URL.createObjectURL(audio)); // replaces the previous one (revoked by the effect)
      void send(audio);
    };
    rec.start();
    setElapsed(0);
    setState({ name: 'recording', startedAt: Date.now() });
  }, [release, send, stopPlayback]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  /** The button: starts (after the explanation, the first time), or stops. */
  const toggle = useCallback(() => {
    if (state.name === 'recording') return stop();
    if (state.name === 'assessing') return;
    if (!consented()) return setState({ name: 'consent' });
    void start();
  }, [state.name, start, stop]);

  const accept = useCallback(() => {
    rememberConsent();
    void start();
  }, [start]);

  const cancel = useCallback(() => setState({ name: 'idle' }), []);

  // The duration, and the automatic stop after 10 seconds.
  useEffect(() => {
    if (state.name !== 'recording') return;
    const timer = setInterval(() => {
      const ms = Date.now() - state.startedAt;
      setElapsed(ms);
      if (ms >= MAX_SECONDS * 1000) stop();
    }, 200);
    return () => clearInterval(timer);
  }, [state, stop]);

  // Shortcut: R starts or stops.
  useEffect(() => {
    if (!supported) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [supported, toggle]);

  return { supported, state, denied, elapsed, toggle, accept, cancel, playback, playing, listen, stopPlayback };
}

export type PronunciationPractice = ReturnType<typeof usePronunciationPractice>;

/** The microphone button, next to « Écouter ». */
export function RepeatButton({ practice }: { practice: PronunciationPractice }) {
  const recording = practice.state.name === 'recording';
  const assessing = practice.state.name === 'assessing';
  return (
    <button
      type="button"
      className={`speak-button repeat-button${recording ? ' is-recording' : ''}`}
      aria-label={recording ? 'Arrêter l’enregistrement' : 'Répéter : m’enregistrer pour évaluer ma prononciation'}
      aria-pressed={recording}
      title={recording ? 'Arrêter (R)' : 'Répéter (R)'}
      disabled={assessing}
      onClick={practice.toggle}
    >
      {recording ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
      ) : (
        <MicrophoneIcon />
      )}
    </button>
  );
}

/**
 * The frame « Évaluer ma prononciation », next to the English: the user
 * records it and hears about it (MEM-90, MEM-91). Optional, and with no
 * effect on the rating or on the state of the item. Keyed by the item by its
 * parent, so the recording and the result are forgotten with it (MEM-92).
 * Shared by the review and the learning (MEM-101). `available`: the
 * assessment is configured on the server; when it isn't, the button is shown
 * disabled, with the reason (MEM-101).
 */
export function PronunciationFrame({ itemId, available = true }: { itemId: string; available?: boolean }) {
  return available ? <AssessmentFrame itemId={itemId} /> : <UnavailableFrame itemId={itemId} />;
}

function AssessmentFrame({ itemId }: { itemId: string }) {
  const practice = usePronunciationPractice(itemId);
  if (!practice.supported) return null;
  return (
    <section className="review-card__practice" aria-labelledby={`practice-title-${itemId}`}>
      <div className="review-card__practice-head">
        <h2 className="review-card__practice-title" id={`practice-title-${itemId}`}>
          Évaluer ma prononciation
        </h2>
        <RepeatButton practice={practice} />
      </div>
      <PracticePanel practice={practice} />
    </section>
  );
}

/** MEM-101: the service is not configured (or the API can't say): the button, disabled, and why. */
function UnavailableFrame({ itemId }: { itemId: string }) {
  return (
    <section className="review-card__practice" aria-labelledby={`practice-title-${itemId}`}>
      <div className="review-card__practice-head">
        <h2 className="review-card__practice-title" id={`practice-title-${itemId}`}>
          Évaluer ma prononciation
        </h2>
        <button
          type="button"
          className="speak-button repeat-button"
          aria-label="Évaluer ma prononciation"
          aria-describedby={`practice-unavailable-${itemId}`}
          disabled
        >
          <MicrophoneIcon />
        </button>
      </div>
      <p className="practice__message practice__message--unavailable" id={`practice-unavailable-${itemId}`}>
        Service d’évaluation indisponible
      </p>
    </section>
  );
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Under the item: the explanation, the recording in progress, then the result. */
export function PracticePanel({ practice }: { practice: PronunciationPractice }) {
  const { state } = practice;
  const [open, setOpen] = useState<number | null>(null); // the word whose sounds are shown
  return (
    <div className="practice">
      {state.name === 'consent' && (
        <div className="practice__consent" role="dialog" aria-labelledby="practice-consent">
          <p id="practice-consent">
            Votre voix est envoyée au service d’évaluation de la prononciation de Microsoft Azure (hébergé en Europe),
            puis effacée : elle n’est pas conservée.
          </p>
          <p className="practice__buttons">
            <button type="button" className="practice__primary" onClick={practice.accept} autoFocus>
              Continuer
            </button>
            <button type="button" className="link-button" onClick={practice.cancel}>
              Annuler
            </button>
          </p>
        </div>
      )}
      {practice.denied && (
        <p className="practice__message" role="alert">
          L’accès au micro est refusé. Autorisez-le dans les réglages du site (l’icône à gauche de l’adresse), puis
          réessayez. Vous pouvez aussi continuer sans vous enregistrer.
        </p>
      )}
      <div aria-live="polite">
        {state.name === 'recording' && (
          <p className="practice__recording">
            <span className="practice__dot" aria-hidden="true" />
            Enregistrement… <span className="practice__time">{mmss(practice.elapsed)}</span>
            <span className="practice__hint"> · dites l’élément, puis arrêtez (R)</span>
          </p>
        )}
        {state.name === 'assessing' && <p className="practice__message">Évaluation…</p>}
        {state.name === 'failed' && <p className="practice__message practice__message--error">{state.message}</p>}
        {state.name === 'result' && state.result.nothingHeard && (
          <p className="practice__message practice__message--error">
            Je n’ai rien entendu : rapprochez-vous du micro et réessayez.
          </p>
        )}
        {state.name === 'result' && !state.result.nothingHeard && (
          <Result result={state.result} open={open} onOpen={setOpen} />
        )}
      </div>
      {practice.playback && state.name !== 'recording' && (
        // MEM-92: the user's own voice, from the browser's memory, to compare with « Écouter ».
        <button
          type="button"
          className="practice__listen"
          aria-pressed={practice.playing}
          onClick={practice.playing ? practice.stopPlayback : practice.listen}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {practice.playing ? (
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            ) : (
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
            )}
          </svg>
          {practice.playing ? 'Arrêter la lecture' : 'Écouter l’enregistrement'}
        </button>
      )}
    </div>
  );
}

function Result({
  result,
  open,
  onOpen,
}: {
  result: PronunciationResult;
  open: number | null;
  onOpen: (index: number | null) => void;
}) {
  const { label, quality } = appreciation(result.score);
  const opened = open !== null ? result.words[open] : undefined;
  return (
    <div className="practice__result">
      <p className="practice__score">
        Prononciation : <strong>{Math.round(result.score)}</strong>
        <span className="practice__out-of"> / 100</span>{' '}
        <span className={`practice__label practice__label--${quality}`}>{label}</span>
      </p>
      <p className="practice__words" lang="en">
        {result.words.map((word, index) => {
          const q = wordQuality(word);
          const sounds = weakSounds(word);
          const text = (
            <>
              {word.word}
              <span className="visually-hidden"> ({QUALITY_LABELS[q]})</span>
            </>
          );
          return sounds.length > 0 ? (
            <button
              key={index}
              type="button"
              className={`practice__word practice__word--${q}`}
              aria-expanded={open === index}
              title={sounds.map((ph) => `/${ph.phoneme}/`).join(' ')}
              onClick={() => onOpen(open === index ? null : index)}
            >
              {text}
            </button>
          ) : (
            <span key={index} className={`practice__word practice__word--${q}`}>
              {text}
            </span>
          );
        })}
      </p>
      {opened && (
        <p className="practice__detail">
          « <span lang="en">{opened.word}</span> » : sons à travailler{' '}
          {weakSounds(opened).map((ph, i) => (
            <span key={i} className={`practice__sound practice__word--${appreciation(ph.score).quality}`}>
              /{ph.phoneme}/
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
