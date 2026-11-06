/**
 * MEM-133: the microphone of the « Chat IA ». The browser streams the voice
 * straight to Azure (never to our servers), with a short-lived token from
 * the API: the text appears while the user speaks, and Azure measures the
 * pronunciation of what it heard (the same service as the cards, MEM-90).
 * Everything that depends on Azure is in `azureRecognizer`; the page only
 * knows `Recognizer`, which the tests replace.
 */

export const TOKEN_HREF = '/anglais/chat/micro/jeton';
/** The recording stops by itself after 2 minutes, or 8 seconds without speech. */
export const MAX_RECORDING_MS = 2 * 60 * 1000;
export const SILENCE_MS = 8 * 1000;
/** A word below this accuracy is one to work on. */
export const WEAK_WORD = 60;

export interface SpeechToken {
  token: string;
  region: string;
  expiresAt: string;
}

/** The scores of one sentence recognized (one pause of the speaker to the next). */
export interface UtteranceScores {
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number | null;
  words: { word: string; accuracy: number; error: string }[];
}

/** The pronunciation of a message said aloud, sent with it (MEM-133). */
export interface SpokenPronunciation {
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number | null;
  words: string[];
}

export interface RecognitionCallbacks {
  /** The words heard so far in the sentence being said: they may still change. */
  onInterim(text: string): void;
  /** The sentence is over (a pause): its final text, and its pronunciation if measured. */
  onFinal(text: string, scores: UtteranceScores | null): void;
  /** The recognition stopped by itself: the connection was lost, or Azure refused. */
  onError(kind: 'connection' | 'unavailable'): void;
}

export interface RecognitionSession {
  stop(): Promise<void>;
}

/** Starts the recognition of the voice of `stream` with `token`. */
export type Recognizer = (
  stream: MediaStream,
  token: SpeechToken,
  callbacks: RecognitionCallbacks,
) => Promise<RecognitionSession>;

// ---------------------------------------------------------------------------
// Azure
// ---------------------------------------------------------------------------

interface AzureWord {
  Word?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
}

/** The scores of a sentence, from the detailed JSON of Azure. */
export function scoresOf(json: string | undefined): UtteranceScores | null {
  if (!json) return null;
  try {
    const best = (
      JSON.parse(json) as {
        NBest?: {
          PronunciationAssessment?: {
            AccuracyScore?: number;
            FluencyScore?: number;
            CompletenessScore?: number;
            PronScore?: number;
          };
          Words?: AzureWord[];
        }[];
      }
    ).NBest?.[0];
    const scores = best?.PronunciationAssessment;
    if (!scores || typeof scores.AccuracyScore !== 'number') return null;
    return {
      score: scores.PronScore ?? scores.AccuracyScore,
      accuracy: scores.AccuracyScore,
      fluency: scores.FluencyScore ?? 0,
      completeness: typeof scores.CompletenessScore === 'number' ? scores.CompletenessScore : null,
      words: (best.Words ?? []).map((word) => ({
        word: word.Word ?? '',
        accuracy: word.PronunciationAssessment?.AccuracyScore ?? 100,
        error: word.PronunciationAssessment?.ErrorType ?? 'None',
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Azure AI Speech, in the browser (its SDK, loaded only when the microphone
 * is used): continuous recognition in American English, with an
 * unscripted pronunciation assessment (no reference text: what was said).
 */
export const azureRecognizer: Recognizer = async (stream, { token, region }, callbacks) => {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = 'en-US';
  config.outputFormat = sdk.OutputFormat.Detailed;
  const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromStreamInput(stream));
  new sdk.PronunciationAssessmentConfig(
    '',
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Word,
    false,
  ).applyTo(recognizer);
  recognizer.recognizing = (_sender, event) => callbacks.onInterim(event.result.text);
  recognizer.recognized = (_sender, event) => {
    if (event.result.reason !== sdk.ResultReason.RecognizedSpeech || !event.result.text) return;
    const json = event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
    callbacks.onFinal(event.result.text, scoresOf(json));
  };
  recognizer.canceled = (_sender, event) => {
    if (event.reason !== sdk.CancellationReason.Error) return;
    const connection =
      event.errorCode === sdk.CancellationErrorCode.ConnectionFailure ||
      event.errorCode === sdk.CancellationErrorCode.ServiceTimeout;
    callbacks.onError(connection ? 'connection' : 'unavailable');
  };
  await new Promise<void>((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, reject));
  return {
    stop: () =>
      new Promise<void>((resolve) =>
        recognizer.stopContinuousRecognitionAsync(
          () => {
            recognizer.close();
            resolve();
          },
          () => {
            recognizer.close();
            resolve();
          },
        ),
      ),
  };
};

// ---------------------------------------------------------------------------
// The token, the microphone, the messages
// ---------------------------------------------------------------------------

export const MIC_DENIED = 'Autorise le micro dans ton navigateur pour parler.';
export const NO_MIC = 'Aucun micro n’a été trouvé : branche un micro, ou écris ta réponse au clavier.';
export const VOICE_LIMIT = 'Limite de reconnaissance vocale atteinte : continue au clavier, ou réessaie plus tard.';
export const VOICE_UNAVAILABLE = 'La reconnaissance vocale est indisponible pour le moment : continue au clavier.';
export const CONNECTION_LOST = 'La connexion a été perdue : le texte déjà reconnu est conservé.';

/** A token for one recording, or the message to show. */
export async function fetchSpeechToken(): Promise<SpeechToken | { error: string }> {
  try {
    const response = await fetch(TOKEN_HREF, { method: 'POST' });
    if (response.ok) return (await response.json()) as SpeechToken;
    return { error: response.status === 429 ? VOICE_LIMIT : VOICE_UNAVAILABLE };
  } catch {
    return { error: VOICE_UNAVAILABLE };
  }
}

/** What a refused microphone becomes, for the user. */
export function microphoneError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return MIC_DENIED;
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return NO_MIC;
  return VOICE_UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// The text, the pronunciation
// ---------------------------------------------------------------------------

/**
 * The spoken text put in the input at `at`, with a space before and after
 * when the neighbours need one: what is already typed stays.
 */
export function insertSpoken(value: string, at: number, spoken: string): { value: string; inserted: string } {
  const before = value.slice(0, at);
  const after = value.slice(at);
  const text = spoken.trim();
  if (!text) return { value, inserted: '' };
  const inserted = `${before && !/\s$/.test(before) ? ' ' : ''}${text}${after && !/^[\s.,!?;:]/.test(after) ? ' ' : ''}`;
  return { value: before + inserted + after, inserted };
}

export const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * The pronunciation of the whole message, from its sentences: the scores
 * weighted by their number of words, and the words to work on (badly
 * pronounced), each once.
 */
export function summarizePronunciation(sentences: UtteranceScores[]): SpokenPronunciation | null {
  const scored = sentences.filter((sentence) => sentence.words.length > 0);
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, sentence) => sum + sentence.words.length, 0);
  const mean = (pick: (sentence: UtteranceScores) => number) =>
    Math.round((scored.reduce((sum, sentence) => sum + pick(sentence) * sentence.words.length, 0) / total) * 10) / 10;
  const completeness = scored.every((sentence) => sentence.completeness !== null)
    ? mean((sentence) => sentence.completeness!)
    : null;
  const words = [
    ...new Set(
      scored
        .flatMap((sentence) => sentence.words)
        .filter((word) => word.error === 'Mispronunciation' || word.accuracy < WEAK_WORD)
        .map((word) => word.word.toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 10);
  return {
    score: mean((sentence) => sentence.score),
    accuracy: mean((sentence) => sentence.accuracy),
    fluency: mean((sentence) => sentence.fluency),
    completeness,
    words,
  };
}
