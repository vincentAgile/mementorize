import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CONVERSATION_MODEL,
  type ConversationModel,
  ConversationModelError,
  type EntryKind,
  type ModelUsage,
} from '../conversations/model/conversation-model.js';
import { contentOf } from '../items/item-content.js';
import { duplicateKey } from '../items/vocabulary/csv/vocabulary-import.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { localDate, startOfNextLocalDay } from '../reminders/local-time.js';
import { AiListLimitsService } from './ai-list-limits.js';
import { type GeneratedEntry, sanitizeEntry } from './generated-entry.js';

/** The model is asked for 5 more entries than given: room for the duplicates, without a second call. */
export const EXTRA_ENTRIES = 5;
/** A generation never takes longer. */
export const GENERATION_TIMEOUT_MS = 30_000;
export const THEME_MAX = 80;
/**
 * The daily count is kept in conversation_usage (MEM-130), under days
 * prefixed so: no migration, and apart from the messages of the Chat IA.
 */
export const USAGE_PREFIX = 'ai-lists:';

export interface GenerationSummary {
  proposed: number;
  skippedDuplicates: number;
}

/** What the stream of a generation sends, in order. */
export type GenerationEvent =
  | { event: 'entry'; data: GeneratedEntry }
  | { event: 'done'; data: GenerationSummary }
  | { event: 'error'; data: { statusCode: number; message: string } };

export interface GenerationInput {
  level: string;
  theme: unknown;
  count: number;
  kind: EntryKind;
  exclude?: string[];
}

const OFF = 'The generation of cards by the AI is off: no AI model is configured';

function providerException(error: unknown): HttpException {
  return error instanceof ConversationModelError && error.kind === 'busy'
    ? new ServiceUnavailableException('The AI is busy: try again in a moment')
    : new BadGatewayException('The AI did not answer: try again');
}

/** The next value of the generator, or a « busy » error when the generation takes too long. */
export function beforeDeadline<T>(next: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ConversationModelError('busy', 'Timeout')), Math.max(0, deadline - Date.now()));
  });
  return Promise.race([next, late]).finally(() => clearTimeout(timer));
}

/**
 * MEM-139: vocabulary cards proposed by the AI, by level, theme, number and
 * kind. Nothing is written: the cards are only proposed (the screens add
 * them). The model is asked for `count` + 5 entries; the duplicates (in its
 * answer, in « Ma liste », already proposed) are removed here, without
 * sending « Ma liste » to the model. 10 generations per user and per day,
 * apart from the Chat IA; a failed one doesn't count. One at a time.
 */
@Injectable()
export class AiListsService {
  private readonly logger = new Logger('AiLists');
  /** The users whose generation is running. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: AiListLimitsService,
    @Inject(CONVERSATION_MODEL) private readonly model: ConversationModel | null,
  ) {}

  get enabled(): boolean {
    return this.model !== null;
  }

  /** Whether it is available, and how many generations are left today. */
  async status(userId: string, now = new Date()): Promise<{ enabled: boolean; remaining: number }> {
    if (!this.model) return { enabled: false, remaining: 0 };
    const [perDay, timeZone] = await Promise.all([this.limits.generationsPerDay(), this.timeZoneOf(userId)]);
    const usage = await this.prisma.conversationUsage.findUnique({
      where: { userId_day: { userId, day: USAGE_PREFIX + localDate(now, timeZone) } },
      select: { count: true },
    });
    return { enabled: true, remaining: Math.max(0, perDay - (usage?.count ?? 0)) };
  }

  /**
   * Checks the request and the limits, counts the generation and calls the
   * model; throws (400, 409, 429, 502, 503) before anything is sent, until
   * the first entry. Then the events: the entries, one by one, and the
   * summary (or an error, if the provider fails in the middle).
   */
  async generate(userId: string, input: GenerationInput, now = new Date()): Promise<AsyncGenerator<GenerationEvent>> {
    const model = this.model;
    if (!model) throw new ServiceUnavailableException(OFF);
    const theme = typeof input.theme === 'string' ? input.theme.trim() : '';
    if (!theme || theme.length > THEME_MAX) {
      throw new BadRequestException(`The theme must have 1 to ${THEME_MAX} characters`);
    }
    if (this.running.has(userId)) throw new ConflictException('A generation is already running');
    this.running.add(userId);
    let handedOver = false;
    try {
      const day = await this.count(userId, now);
      const known = await this.knownEnglish(userId, input.exclude ?? []);
      const entries = this.entries(model, userId, { ...input, theme }, known);
      let first: IteratorResult<GeneratedEntry, GenerationSummary>;
      try {
        first = await entries.next();
      } catch (error) {
        await this.giveBack(userId, day);
        throw providerException(error);
      }
      handedOver = true;
      return this.events(userId, day, first, entries);
    } finally {
      if (!handedOver) this.running.delete(userId);
    }
  }

  private async *events(
    userId: string,
    day: string,
    first: IteratorResult<GeneratedEntry, GenerationSummary>,
    entries: AsyncGenerator<GeneratedEntry, GenerationSummary>,
  ): AsyncGenerator<GenerationEvent> {
    try {
      let next = first;
      while (!next.done) {
        yield { event: 'entry', data: next.value };
        try {
          next = await entries.next();
        } catch (error) {
          await this.giveBack(userId, day);
          const exception = providerException(error);
          yield { event: 'error', data: { statusCode: exception.getStatus(), message: exception.message } };
          return;
        }
      }
      yield { event: 'done', data: next.value };
    } finally {
      this.running.delete(userId);
    }
  }

  /** The entries to propose, checked and without duplicates, `count` at most. */
  private async *entries(
    model: ConversationModel,
    userId: string,
    input: GenerationInput & { theme: string },
    known: Set<string>,
  ): AsyncGenerator<GeneratedEntry, GenerationSummary> {
    const start = Date.now();
    const deadline = start + GENERATION_TIMEOUT_MS;
    const written = model.generateEntries({
      level: input.level,
      theme: input.theme,
      count: input.count + EXTRA_ENTRIES,
      kind: input.kind,
    });
    const seen = new Set<string>();
    let valid = 0;
    let proposed = 0;
    let skippedDuplicates = 0;
    try {
      for (;;) {
        const next = await beforeDeadline(written.next(), deadline);
        if (next.done) {
          this.logUsage(userId, model, Date.now() - start, next.value);
          break;
        }
        const entry = sanitizeEntry(next.value, input.theme);
        if (!entry) continue;
        valid++;
        const key = duplicateKey(entry.english);
        if (seen.has(key) || known.has(key)) {
          skippedDuplicates++;
          continue;
        }
        seen.add(key);
        proposed++;
        yield entry;
        if (proposed >= input.count) {
          // Enough: the rest of the answer is read without waiting, for the log.
          void this.drain(written, userId, model, start);
          break;
        }
      }
    } catch (error) {
      void written.return(undefined as never).catch(() => undefined);
      this.logFailure(userId, model, Date.now() - start, error);
      throw error;
    }
    if (valid === 0) {
      this.logFailure(userId, model, Date.now() - start, null);
      throw new ConversationModelError('failed', 'No usable entry');
    }
    return { proposed, skippedDuplicates };
  }

  private async drain(
    written: AsyncGenerator<unknown, ModelUsage>,
    userId: string,
    model: ConversationModel,
    start: number,
  ) {
    try {
      for (;;) {
        const next = await written.next();
        if (next.done) {
          this.logUsage(userId, model, Date.now() - start, next.value);
          return;
        }
      }
    } catch {
      // the entries given are fine; the end of the answer doesn't matter
    }
  }

  /** The English of « Ma liste » and of `exclude`, compared like the import does (MEM-50). Never sent to the model. */
  private async knownEnglish(userId: string, exclude: string[]): Promise<Set<string>> {
    const items = await this.prisma.item.findMany({
      where: { userId, type: 'Vocabulary' },
      select: { content: true, type: true },
    });
    const known = new Set(exclude.map(duplicateKey));
    for (const item of items) known.add(duplicateKey(contentOf({ ...item, type: 'Vocabulary' as const }).word));
    return known;
  }

  /** One more generation today, or 429 with the hour it comes back. Returns the day counted. */
  private async count(userId: string, now: Date): Promise<string> {
    const [perDay, timeZone] = await Promise.all([this.limits.generationsPerDay(), this.timeZoneOf(userId)]);
    const day = USAGE_PREFIX + localDate(now, timeZone);
    const counted = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "conversation_usage" ("userId", "day", "count") VALUES (${userId}, ${day}, 1)
      ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "conversation_usage"."count" + 1
      WHERE "conversation_usage"."count" < ${perDay}
      RETURNING "count"`;
    if (counted.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          reason: 'daily-limit',
          message: `Daily limit of ${perDay} generations reached`,
          retryAt: startOfNextLocalDay(now, timeZone).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return day;
  }

  /** A failed generation doesn't count. */
  private async giveBack(userId: string, day: string): Promise<void> {
    await this.prisma.conversationUsage.updateMany({
      where: { userId, day, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }

  private async timeZoneOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { reminderTimeZone: true } });
    return user?.reminderTimeZone ?? 'Europe/Paris';
  }

  /** The cost of a generation: who, how long, how many tokens; never the text. */
  private logUsage(userId: string, model: ConversationModel, durationMs: number, usage: ModelUsage): void {
    this.logger.log(
      `model call: model=${model.name} call=generation user=${userId} durationMs=${durationMs} ` +
        `inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens}`,
    );
  }

  private logFailure(userId: string, model: ConversationModel, durationMs: number, error: unknown): void {
    const reason =
      error instanceof ConversationModelError
        ? `${error.kind}: ${error.message}`
        : error
          ? 'unexpected error'
          : 'no usable entry';
    this.logger.warn(
      `model call failed: model=${model.name} call=generation user=${userId} durationMs=${durationMs} (${reason})`,
    );
  }
}
