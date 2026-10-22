import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Speech {
  audio: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/** Kokoro's American voice, the best rated (MEM-39: the PO's choice). */
export const DEFAULT_VOICE = 'af_heart';

/**
 * Talks to Kokoro (MEM-39): the Kokoro-FastAPI server, in its own container
 * next to the API, never exposed to the Internet. Its speech endpoint
 * follows OpenAI's (POST /v1/audio/speech). Configured by KOKORO_URL (e.g.
 * http://kokoro:8880) and KOKORO_VOICE; without KOKORO_URL, the generation
 * is disabled and the web app keeps the browser's speech synthesis.
 */
@Injectable()
export class KokoroClient {
  private readonly logger = new Logger(KokoroClient.name);
  private readonly url: string | null;
  readonly voice: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('KOKORO_URL')?.trim().replace(/\/+$/, '') || null;
    this.voice = config.get<string>('KOKORO_VOICE')?.trim() || DEFAULT_VOICE;
    if (!this.url) {
      this.logger.log('KOKORO_URL is not set: pronunciations are not generated');
    }
  }

  get enabled(): boolean {
    return this.url !== null;
  }

  /** The English text, read by the voice, as MP3 (played by every browser). */
  async speak(text: string): Promise<Speech> {
    if (!this.url) throw new Error('Kokoro is disabled (KOKORO_URL is not set)');
    const response = await fetch(`${this.url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', input: text, voice: this.voice, response_format: 'mp3', speed: 1 }),
      // A sentence takes a few seconds on the server's processor; a server
      // that never answers must not hold the queue forever.
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`Kokoro answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) throw new Error('Kokoro sent an empty answer');
    return { audio, mimeType: 'audio/mpeg' };
  }
}
