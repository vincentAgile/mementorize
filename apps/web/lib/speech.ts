/**
 * The pronunciation of English (MEM-37), with the browser's speech
 * synthesis (Web Speech API). Everything that depends on it is here: moving
 * later to a speech service in the cloud means changing this file only.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

const isEnglish = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase().startsWith('en');
const isBritish = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase() === 'en-gb';

/** British English first (local voices before network ones), else any English voice. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(isEnglish);
  const byQuality = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
    Number(b.localService) - Number(a.localService);
  return english.filter(isBritish).sort(byQuality)[0] ?? english.sort(byQuality)[0] ?? null;
}

function synthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
    ? window.speechSynthesis
    : null;
}

/** The English voice; `null` when there is none, or no speech synthesis, or not known yet. */
function englishVoice(): SpeechSynthesisVoice | null {
  const speech = synthesis();
  if (!speech) return null;
  if (cachedVoice === undefined) {
    const voices = speech.getVoices();
    // Chrome lists its voices asynchronously: an empty list may just be "not yet".
    if (voices.length > 0) cachedVoice = pickVoice(voices);
  }
  return cachedVoice ?? null;
}

/** Whether English can be pronounced (for useSyncExternalStore). */
export function canPronounce(): boolean {
  return englishVoice() !== null;
}

/** Calls `onChange` when the browser lists its voices (for useSyncExternalStore). */
export function subscribeToVoices(onChange: () => void): () => void {
  const speech = synthesis();
  if (!speech) return () => {};
  const listener = () => {
    cachedVoice = pickVoice(speech.getVoices());
    onChange();
  };
  speech.addEventListener('voiceschanged', listener);
  return () => speech.removeEventListener('voiceschanged', listener);
}

/** Says the English text, from the start: a reading in progress is cut. */
export function pronounce(text: string): void {
  const speech = synthesis();
  const voice = englishVoice();
  if (!speech || !voice) return;
  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  speech.speak(utterance);
}

/** Stops the reading in progress, if any. */
export function stopPronouncing(): void {
  synthesis()?.cancel();
}
