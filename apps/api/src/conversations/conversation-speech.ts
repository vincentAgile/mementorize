import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KokoroClient, type Speech } from '../pronunciation/kokoro.client.js';
import { OPENING_QUESTION } from './model/prompts.js';

/** A sentence read at a time: the replies are read sentence by sentence. */
export const SPEECH_MAX_LENGTH = 500;

/** Leaves Kokoro time to start, when both containers start together. */
const WARM_UP_DELAY_MS = 20_000;

/**
 * MEM-132: the voice of the « Chat IA », Kokoro's (the same as the
 * pronunciation of the cards, MEM-39). A free text is read and sent back,
 * neither kept nor logged. The opening question, always the same, is read
 * once in advance and kept in memory: it starts at once.
 */
@Injectable()
export class ConversationSpeech implements OnApplicationBootstrap {
  private readonly logger = new Logger('ConversationSpeech');
  private opening: Promise<Speech> | null = null;

  constructor(private readonly kokoro: KokoroClient) {}

  get enabled(): boolean {
    return this.kokoro.enabled;
  }

  onApplicationBootstrap(): void {
    if (!this.kokoro.enabled) return;
    const timer = setTimeout(() => void this.openingSpeech().catch(() => undefined), WARM_UP_DELAY_MS);
    timer.unref(); // never keeps the process (or a test) alive
  }

  /** A sentence of the conversation, read: 400 if empty or too long, 503 without Kokoro, 502 if it fails. */
  async speak(rawText: unknown): Promise<Speech> {
    const text = typeof rawText === 'string' ? rawText.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new BadRequestException('The text is empty');
    if (text.length > SPEECH_MAX_LENGTH) {
      throw new BadRequestException(`The text is longer than ${SPEECH_MAX_LENGTH} characters`);
    }
    if (!this.kokoro.enabled) throw new ServiceUnavailableException('No voice on this server');
    try {
      return await this.kokoro.speak(text);
    } catch (error) {
      this.logger.warn(`Speech failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadGatewayException('The voice did not answer');
    }
  }

  /** The opening question, read once (and again after a failure). */
  async openingSpeech(): Promise<Speech> {
    if (!this.kokoro.enabled) throw new ServiceUnavailableException('No voice on this server');
    if (!this.opening) {
      this.opening = this.kokoro.speak(OPENING_QUESTION);
      this.opening.catch((error: unknown) => {
        this.opening = null; // tried again at the next request
        this.logger.warn(`Opening question not read: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    try {
      return await this.opening;
    } catch {
      throw new BadGatewayException('The voice did not answer');
    }
  }
}
