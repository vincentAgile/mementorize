import { Logger } from '@nestjs/common';
import { toWav } from './audio-conversion.js';
import {
  type PronunciationAssessment,
  type PronunciationAssessor,
  type Recording,
  VoiceUnavailableError,
  type WordAssessment,
  type WordError,
} from './pronunciation-assessor.js';

/** MEM-90: 15 seconds at most, conversion included. */
const TIMEOUT_MS = 15_000;

/** A word scored below this has its sounds detailed. */
const DETAILED_BELOW = 80;

interface AzureScores {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
  ErrorType?: string;
}
/** The scores are at the top of the REST response, under PronunciationAssessment in the SDK's. */
type WithScores<T> = T & AzureScores & { PronunciationAssessment?: AzureScores };
interface AzurePhoneme {
  Phoneme?: string;
}
interface AzureWord {
  Word?: string;
  Phonemes?: WithScores<AzurePhoneme>[];
}
interface AzureResponse {
  RecognitionStatus?: string;
  DisplayText?: string;
  SNR?: number;
  NBest?: WithScores<{ Lexical?: string; Words?: WithScores<AzureWord>[] }>[];
}

const scores = <T>(node: WithScores<T> | undefined): AzureScores => node?.PronunciationAssessment ?? node ?? {};
const round = (value: number | undefined) => Math.round((value ?? 0) * 10) / 10;

const ERRORS: Record<string, WordError> = {
  None: 'none',
  Omission: 'omission',
  Insertion: 'insertion',
  Mispronunciation: 'mispronunciation',
};

/**
 * Azure AI Speech, Pronunciation Assessment (MEM-90, chosen by MEM-93): the
 * REST API for short audio, with the reference text, en-US, down to the
 * phoneme (IPA). No prosody (no use for isolated words, and billed apart),
 * and no `storeAudio`: Azure keeps nothing.
 */
export class AzurePronunciationAssessor implements PronunciationAssessor {
  private readonly logger = new Logger(AzurePronunciationAssessor.name);
  private readonly endpoint: string;

  constructor(
    private readonly key: string,
    region: string,
    /** For the tests: another address than Azure's. */
    endpoint?: string,
  ) {
    this.endpoint = `${endpoint ?? `https://${region}.stt.speech.microsoft.com`}/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
  }

  async assess(recording: Recording, referenceText: string): Promise<PronunciationAssessment> {
    const deadline = AbortSignal.timeout(TIMEOUT_MS);
    const wav = await toWav(recording.data);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          Accept: 'application/json',
          'Pronunciation-Assessment': header(referenceText),
        },
        body: new Uint8Array(wav),
        signal: deadline,
      });
    } catch (error) {
      throw new VoiceUnavailableError(`Azure unreachable: ${(error as Error).name}`);
    }
    if (!response.ok) {
      // The status only: the body might echo the request.
      this.logger.warn(`Azure answered ${response.status}`);
      throw new VoiceUnavailableError(`Azure answered ${response.status}`);
    }
    return normalize((await response.json()) as AzureResponse, referenceText);
  }
}

/** The Pronunciation-Assessment header: the parameters, in JSON, in base64. */
export function header(referenceText: string): string {
  const params = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: 'True',
    PhonemeAlphabet: 'IPA',
  };
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
}

/** Azure's answer, in the terms of the voice layer. */
export function normalize(response: AzureResponse, referenceText: string): PronunciationAssessment {
  const best = response.NBest?.[0];
  const heard = (best?.Lexical ?? response.DisplayText ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  const words: WordAssessment[] = (best?.Words ?? []).map((word) => {
    const score = round(scores(word).AccuracyScore);
    const error = ERRORS[scores(word).ErrorType ?? 'None'] ?? 'none';
    const detailed = error === 'mispronunciation' || (error === 'none' && score < DETAILED_BELOW);
    return {
      word: word.Word ?? '',
      score,
      error,
      ...(detailed && {
        phonemes: (word.Phonemes ?? []).map((ph) => ({
          phoneme: ph.Phoneme ?? '',
          score: round(scores(ph).AccuracyScore),
        })),
      }),
    };
  });
  const nothingHeard =
    response.RecognitionStatus !== 'Success' ||
    !heard ||
    (words.length > 0 && words.every((word) => word.error === 'omission'));
  const accuracy = round(scores(best).AccuracyScore);
  const singleWord = referenceText.trim().split(/\s+/).length === 1;
  return {
    nothingHeard,
    score: nothingHeard ? 0 : singleWord ? accuracy : round(scores(best).PronScore),
    accuracy,
    fluency: round(scores(best).FluencyScore),
    completeness: round(scores(best).CompletenessScore),
    words,
  };
}
