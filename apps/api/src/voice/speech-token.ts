import { Logger } from '@nestjs/common';
import { VoiceUnavailableError } from './pronunciation-assessor.js';

/**
 * MEM-133: a short-lived token for the speech recognition in the browser
 * (the « Chat IA »'s microphone): the browser streams the voice straight to
 * the provider with it, and the key never leaves the server.
 */
export interface SpeechToken {
  token: string;
  region: string;
  /** ISO date: the provider's tokens last 10 minutes; a little less, to be safe. */
  expiresAt: string;
}

export interface SpeechTokenIssuer {
  /** Throws VoiceUnavailableError. */
  issue(): Promise<SpeechToken>;
}

/** Injection token: null when no provider is configured (the microphone is not offered). */
export const SPEECH_TOKEN_ISSUER = Symbol('SpeechTokenIssuer');

const VALID_MS = 9 * 60 * 1000;

/** Azure AI Speech: the token service of the resource (POST …/sts/v1.0/issueToken), valid 10 minutes. */
export class AzureSpeechTokenIssuer implements SpeechTokenIssuer {
  private readonly logger = new Logger(AzureSpeechTokenIssuer.name);
  private readonly endpoint: string;

  constructor(
    private readonly key: string,
    private readonly region: string,
    /** For the tests: another address than Azure's. */
    endpoint?: string,
  ) {
    this.endpoint = `${endpoint ?? `https://${region}.api.cognitive.microsoft.com`}/sts/v1.0/issueToken`;
  }

  async issue(): Promise<SpeechToken> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': this.key, 'Content-Length': '0' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new VoiceUnavailableError(`Azure unreachable: ${(error as Error).name}`);
    }
    if (!response.ok) {
      this.logger.warn(`Azure token service answered ${response.status}`);
      throw new VoiceUnavailableError(`Azure answered ${response.status}`);
    }
    const token = (await response.text()).trim();
    if (!token) throw new VoiceUnavailableError('Azure sent an empty token');
    return { token, region: this.region, expiresAt: new Date(Date.now() + VALID_MS).toISOString() };
  }
}
