import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PronunciationAssessmentService } from '../pronunciation-assessment/pronunciation-assessment.service.js';
import { VoiceUnavailableError } from '../voice/pronunciation-assessor.js';
import { SPEECH_TOKEN_ISSUER, type SpeechToken, type SpeechTokenIssuer } from '../voice/speech-token.js';

/**
 * MEM-133: the microphone of the « Chat IA ». The browser streams the voice
 * straight to Azure, with a short-lived token given here: the key stays on
 * the server, and no audio ever comes to it. Each recording counts in the
 * limits of the pronunciation assessment (per minute and per day).
 */
@Injectable()
export class ConversationVoiceInput {
  constructor(
    @Inject(SPEECH_TOKEN_ISSUER) private readonly issuer: SpeechTokenIssuer | null,
    private readonly limits: PronunciationAssessmentService,
  ) {}

  /** Whether the microphone is offered (Azure configured). */
  get enabled(): boolean {
    return this.issuer !== null;
  }

  /** A token for one recording: 503 without Azure or if it fails, 429 beyond the limits. */
  async token(userId: string): Promise<SpeechToken> {
    if (!this.issuer) throw new ServiceUnavailableException('Voice input is off');
    await this.limits.consume(userId);
    try {
      return await this.issuer.issue();
    } catch (error) {
      if (error instanceof VoiceUnavailableError) throw new ServiceUnavailableException('Voice input unavailable');
      throw error;
    }
  }
}

/** The pronunciation of a message said aloud, as the browser measured it with Azure. */
export interface SpokenPronunciation {
  /** The overall pronunciation score, 0 to 100. */
  score: number;
  accuracy: number;
  fluency: number;
  /** Null when the provider didn't give it. */
  completeness: number | null;
  /** The words to work on (badly pronounced), 10 at most. */
  words: string[];
}

/** Checks and bounds the pronunciation sent with a message. Null if absent or unusable. */
export function sanitizePronunciation(value: unknown): SpokenPronunciation | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const score = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 10) / 10 : null;
  const [overall, accuracy, fluency] = [score(raw.score), score(raw.accuracy), score(raw.fluency)];
  if (overall === null || accuracy === null || fluency === null) return null;
  const words = Array.isArray(raw.words)
    ? [...new Set(raw.words.filter((w): w is string => typeof w === 'string').map((w) => w.trim().slice(0, 40)))]
        .filter(Boolean)
        .slice(0, 10)
    : [];
  return { score: overall, accuracy, fluency, completeness: score(raw.completeness), words };
}
