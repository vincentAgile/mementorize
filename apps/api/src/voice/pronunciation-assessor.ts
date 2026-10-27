/**
 * The voice layer (MEM-90): what the rest of the API knows about speech
 * services, independent of any provider. A first implementation uses Azure
 * AI Speech (azure-pronunciation-assessor.ts); speech recognition (the car
 * mode) and the dialogue mode will come here too. No other module talks to
 * Azure.
 */

/** An error of a word, as the provider reports it. */
export type WordError = 'none' | 'omission' | 'insertion' | 'mispronunciation';

export interface PhonemeScore {
  /** In the International Phonetic Alphabet, e.g. « θ ». */
  phoneme: string;
  /** 0 to 100. */
  score: number;
}

export interface WordAssessment {
  word: string;
  /** Accuracy of the word, 0 to 100. */
  score: number;
  error: WordError;
  /** For a word not well pronounced: its sounds and their scores. */
  phonemes?: PhonemeScore[];
}

/** The assessment of a recording against the text it should say. */
export interface PronunciationAssessment {
  /**
   * Nothing could be heard (silence, too quiet, cut off): not a bad
   * pronunciation, the recording is to do again (MEM-93).
   */
  nothingHeard: boolean;
  /**
   * The overall score, 0 to 100. A single word: its accuracy (the overall
   * score of the providers drops to almost 0 for one mispronounced word,
   * MEM-93); several words: the overall pronunciation score.
   */
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  words: WordAssessment[];
}

/** An audio recording, as the browser made it (WebM/Opus, MP4/AAC, OGG…). */
export interface Recording {
  data: Buffer;
  mimeType: string;
}

export interface PronunciationAssessor {
  /** Assesses the recording against `referenceText` (English). Throws VoiceUnavailableError. */
  assess(recording: Recording, referenceText: string): Promise<PronunciationAssessment>;
}

/** Injection token: null when no provider is configured (the feature is off). */
export const PRONUNCIATION_ASSESSOR = Symbol('PronunciationAssessor');

/** The provider can't answer now (down, quota, timeout, wrong key). The message is for the logs only. */
export class VoiceUnavailableError extends Error {}

/** The recording can't be assessed: too short, too long, unreadable. */
export class InvalidRecordingError extends Error {
  constructor(public readonly reason: 'too-short' | 'too-long' | 'unreadable') {
    super(`Invalid recording: ${reason}`);
  }
}
