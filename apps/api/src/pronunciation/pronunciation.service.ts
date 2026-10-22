import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { KokoroClient } from './kokoro.client.js';

/** The English of a vocabulary item's content, or null. */
export function englishOf(content: unknown): string | null {
  const word = (content as { word?: unknown } | null)?.word;
  return typeof word === 'string' && word.trim() ? word.trim() : null;
}

/** After a failure (Kokoro starting or busy), another try 1, 2, 4, 8, 16 minutes later. */
const RETRY_DELAYS_MS = [1, 2, 4, 8, 16].map((minutes) => minutes * 60_000);

/** Leaves Kokoro time to start, when both containers start together. */
const CATCH_UP_DELAY_MS = 15_000;

/**
 * The pronunciation of vocabulary items (MEM-39): generated once by Kokoro,
 * stored in the database (so in the backups), served to the web app.
 *
 * Generation happens in the background, one item at a time: adding a word
 * never waits for it, and the server's processor isn't flooded. Whatever is
 * missing or out of date (English edited, voice changed, Kokoro down when a
 * word was added) is caught up when the API starts.
 */
@Injectable()
export class PronunciationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PronunciationService.name);
  private readonly queue = new Set<string>();
  private readonly failures = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kokoro: KokoroClient,
  ) {}

  onApplicationBootstrap(): void {
    if (this.kokoro.enabled) this.later(CATCH_UP_DELAY_MS, () => void this.catchUp());
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /** Asks for the pronunciation of a vocabulary item (new, or English edited), in the background. */
  request(itemId: string): void {
    if (!this.kokoro.enabled || this.stopped) return;
    this.queue.add(itemId);
    void this.drain();
  }

  /** Every vocabulary item whose pronunciation is missing or out of date goes to the queue. */
  async catchUp(): Promise<number> {
    const items = await this.prisma.item.findMany({
      where: { type: 'Vocabulary' },
      select: { id: true, content: true, pronunciation: { select: { text: true, voice: true } } },
    });
    const due = items.filter(
      (item) =>
        englishOf(item.content) !== null &&
        (item.pronunciation?.text !== englishOf(item.content) || item.pronunciation?.voice !== this.kokoro.voice),
    );
    if (due.length > 0) {
      this.logger.log(`Generating ${due.length} pronunciation(s) with the voice ${this.kokoro.voice}`);
      for (const item of due) this.request(item.id);
    }
    return due.length;
  }

  /**
   * Generates and stores the pronunciation of one item, unless it is up to
   * date. Returns whether it did.
   */
  async generate(itemId: string): Promise<boolean> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { type: true, content: true, pronunciation: { select: { text: true, voice: true } } },
    });
    const text = item?.type === 'Vocabulary' ? englishOf(item.content) : null;
    if (!text) return false; // deleted meanwhile, or not vocabulary
    const { voice } = this.kokoro;
    if (item?.pronunciation?.text === text && item.pronunciation.voice === voice) return false;

    const { audio, mimeType } = await this.kokoro.speak(text);
    await this.prisma.pronunciation.upsert({
      where: { itemId },
      create: { itemId, text, voice, audio, mimeType },
      update: { text, voice, audio, mimeType, createdAt: new Date() },
    });
    return true;
  }

  /**
   * The audio of an item of this user, if it matches its current English:
   * after an edit, the old one is never played (the web app falls back on
   * the browser's speech synthesis until the new one is ready).
   */
  async find(userId: string, itemId: string): Promise<{ audio: Uint8Array; mimeType: string } | null> {
    const pronunciation = await this.prisma.pronunciation.findFirst({
      where: { itemId, item: { userId, type: 'Vocabulary' } },
      select: { text: true, audio: true, mimeType: true, item: { select: { content: true } } },
    });
    if (!pronunciation || pronunciation.text !== englishOf(pronunciation.item.content)) return null;
    return { audio: pronunciation.audio, mimeType: pronunciation.mimeType };
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.size > 0 && !this.stopped) {
        const [itemId] = this.queue;
        this.queue.delete(itemId);
        try {
          await this.generate(itemId);
          this.failures.delete(itemId);
        } catch (error) {
          this.retryLater(itemId, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private retryLater(itemId: string, error: unknown): void {
    const attempt = this.failures.get(itemId) ?? 0;
    const message = error instanceof Error ? error.message : String(error);
    if (attempt >= RETRY_DELAYS_MS.length) {
      this.failures.delete(itemId);
      this.logger.warn(`Pronunciation of ${itemId} abandoned until the next start: ${message}`);
      return;
    }
    this.failures.set(itemId, attempt + 1);
    this.logger.warn(`Pronunciation of ${itemId} failed (${message}); another try later`);
    this.later(RETRY_DELAYS_MS[attempt], () => this.request(itemId));
  }

  private later(delay: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, delay);
    timer.unref(); // never keeps the process (or a test) alive
    this.timers.add(timer);
  }
}
