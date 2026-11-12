import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { localDate, startOfNextLocalDay } from '../reminders/local-time.js';
import { ChatUsageService } from './chat-usage.service.js';
import { ConversationLimitsService } from './conversation-limits.js';
import { sanitizePronunciation, type SpokenPronunciation } from './conversation-voice-input.js';
import {
  type ChatTurn,
  CONVERSATION_MODEL,
  type ConversationModel,
  ConversationModelError,
  type Evaluation,
  type ModelUsage,
} from './model/conversation-model.js';
import { OPENING_QUESTION } from './model/prompts.js';

/** The history the model receives: the last 20 exchanges. */
export const HISTORY_MESSAGES = 40;
/** Conversations are deleted 90 days after they began. */
export const KEPT_DAYS = 90;
/** A message of the user without reply for longer is abandoned (the API stopped): another may follow. */
const PENDING_MS = 2 * 60 * 1000;
const MESSAGE_MAX = 4000;
const TITLE_MAX = 80;

const MESSAGE_SELECT = {
  id: true,
  position: true,
  role: true,
  text: true,
  evaluation: true,
  createdAt: true,
} satisfies Prisma.ConversationMessageSelect;

export type SavedMessage = Prisma.ConversationMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/** What the stream of a message sends, in order (MEM-130). */
export type TurnEvent =
  | { event: 'evaluation'; data: { message: SavedMessage } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { message: SavedMessage } }
  | { event: 'error'; data: { statusCode: number; message: string } };

/** A message of the user, saved, waiting for its reply. */
interface Turn {
  userId: string;
  conversationId: string;
  message: SavedMessage;
  day: string;
  history: ChatTurn[];
  /** MEM-135: the length asked of the reply, in words. */
  maxReplyWords: number;
}

const OFF = 'The conversations with the AI are off: no AI model is configured';
const OFF_BY_ADMIN = 'The conversations with the AI are off';

/** MEM-135: as the console shows it. */
export type ChatState = 'active' | 'off' | 'unconfigured';

/** The 503 or 502 of a failure of the provider: never an empty reply. */
function providerException(error: ConversationModelError): HttpException {
  return error.kind === 'busy'
    ? new ServiceUnavailableException('The AI is busy: try again in a moment')
    : new BadGatewayException('The AI did not answer: try again');
}

/**
 * MEM-130: the written conversations in English with the AI. Each message
 * of the user gets an evaluation (its corrections) and a reply, two calls of
 * the model made at the same time. Limits per day, in the user's time zone,
 * and per conversation. A failure of the provider gives the message back:
 * it is removed, and doesn't count.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('Conversations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: ConversationLimitsService,
    private readonly usage: ChatUsageService,
    @Inject(CONVERSATION_MODEL) private readonly model: ConversationModel | null,
  ) {}

  get enabled(): boolean {
    return this.model !== null;
  }

  /** MEM-135: active, off in the console, or without an AI model (the environment). */
  async state(): Promise<ChatState> {
    if (!this.model) return 'unconfigured';
    return (await this.limits.settingsNow()).enabled ? 'active' : 'off';
  }

  async status(userId: string, now = new Date()) {
    if ((await this.state()) !== 'active') return { enabled: false };
    const limits = await this.limits.current();
    const timeZone = await this.timeZoneOf(userId);
    const usage = await this.prisma.conversationUsage.findUnique({
      where: { userId_day: { userId, day: localDate(now, timeZone) } },
      select: { count: true },
    });
    // MEM-131: when the count of the day starts again, for the web app's message before the limit.
    const resetAt = startOfNextLocalDay(now, timeZone).toISOString();
    return { enabled: true, limits, usedToday: usage?.count ?? 0, resetAt };
  }

  async create(userId: string) {
    await this.requireOn();
    const conversation = await this.prisma.conversation.create({
      data: { userId, messages: { create: { position: 0, role: 'Assistant', text: OPENING_QUESTION } } },
      select: { id: true },
    });
    await this.usage.record(userId, { conversations: 1 }); // MEM-135
    return this.get(userId, conversation.id);
  }

  /** The most recent first. */
  async list(userId: string) {
    this.requireModel();
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
    });
    return rows.map(({ _count, ...row }) => ({ ...row, messageCount: _count.messages }));
  }

  /** The messages in order. Another user's conversation: 404. */
  async get(userId: string, id: string) {
    this.requireModel();
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: { orderBy: { position: 'asc' }, select: MESSAGE_SELECT },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async remove(userId: string, id: string): Promise<void> {
    this.requireModel();
    const { count } = await this.prisma.conversation.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Conversation not found');
  }

  /**
   * A message of the user. Checks it and the limits, saves it, and calls the
   * model; throws (400, 404, 409, 429, 502, 503) before anything is sent.
   * Then the events: the evaluation, the reply piece by piece, and the reply
   * saved (or an error, if the provider fails in the middle).
   */
  async send(userId: string, conversationId: string, rawText: unknown, now = new Date(), rawPronunciation?: unknown) {
    const model = await this.requireOn();
    const turn = await this.start(userId, conversationId, rawText, now);
    await this.usage.record(userId, { messages: 1 }, now); // MEM-135, given back on a failure

    const evaluationStart = Date.now();
    const evaluation = model.evaluate(turn.history).then(
      (result) => {
        this.logUsage(userId, 'evaluation', Date.now() - evaluationStart, result.usage);
        return result.evaluation;
      },
      (error: unknown) => {
        this.logFailure(userId, 'evaluation', Date.now() - evaluationStart, error);
        throw error;
      },
    );
    const replyStart = Date.now();
    const reply = model.reply(turn.history, { maxWords: turn.maxReplyWords });
    const [evaluated, first] = await Promise.allSettled([evaluation, reply.next()]);

    if (evaluated.status === 'rejected' || first.status === 'rejected' || first.value.done) {
      void reply.return(undefined as never).catch(() => undefined);
      if (first.status === 'rejected') this.logFailure(userId, 'reply', Date.now() - replyStart, first.reason);
      await this.giveBack(turn);
      const error =
        evaluated.status === 'rejected' ? evaluated.reason : first.status === 'rejected' ? first.reason : null;
      throw providerException(
        error instanceof ConversationModelError ? error : new ConversationModelError('failed', 'Empty reply'),
      );
    }
    // MEM-133: said aloud, the pronunciation measured in the browser joins the evaluation.
    const pronunciation = sanitizePronunciation(rawPronunciation);
    const message = await this.saveEvaluation(
      turn,
      pronunciation ? { ...evaluated.value, pronunciation } : evaluated.value,
    );
    return this.events(turn, message, first.value.value, reply, replyStart);
  }

  private async *events(
    turn: Turn,
    message: SavedMessage,
    first: string,
    reply: AsyncGenerator<string, ModelUsage, void>,
    replyStart: number,
  ): AsyncGenerator<TurnEvent> {
    yield { event: 'evaluation', data: { message } };
    let text = first;
    yield { event: 'delta', data: { text: first } };
    try {
      for (;;) {
        const next = await reply.next();
        if (next.done) {
          this.logUsage(turn.userId, 'reply', Date.now() - replyStart, next.value);
          break;
        }
        text += next.value;
        yield { event: 'delta', data: { text: next.value } };
      }
    } catch (error) {
      this.logFailure(turn.userId, 'reply', Date.now() - replyStart, error);
      await this.giveBack(turn);
      const exception = providerException(
        error instanceof ConversationModelError ? error : new ConversationModelError('failed', 'Provider error'),
      );
      yield { event: 'error', data: { statusCode: exception.getStatus(), message: exception.message } };
      return;
    }
    yield { event: 'done', data: { message: await this.saveReply(turn, text) } };
  }

  /** Checks the message and the limits, then saves it; under a lock of the conversation. */
  private async start(userId: string, conversationId: string, rawText: unknown, now: Date): Promise<Turn> {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) throw new BadRequestException('The message is empty');
    const limits = await this.limits.current();
    if (text.length > limits.maxLength) {
      throw new BadRequestException(`The message is longer than ${limits.maxLength} characters`);
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "conversations" WHERE "id" = ${conversationId} AND "userId" = ${userId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Conversation not found');

      const messages = await tx.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { position: 'desc' },
        take: HISTORY_MESSAGES - 1,
        select: { position: true, role: true, text: true, createdAt: true },
      });
      const last = messages[0];
      if (last?.role === 'User' && now.getTime() - last.createdAt.getTime() < PENDING_MS) {
        throw new ConflictException('The previous message is still waiting for its reply');
      }
      const sent = await tx.conversationMessage.count({ where: { conversationId, role: 'User' } });
      if (sent >= limits.messagesPerConversation) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            reason: 'conversation-limit',
            message: `This conversation has reached ${limits.messagesPerConversation} messages: start a new one`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { reminderTimeZone: true } });
      const day = localDate(now, user.reminderTimeZone);
      const counted = await tx.$queryRaw<{ count: number }[]>`
        INSERT INTO "conversation_usage" ("userId", "day", "count") VALUES (${userId}, ${day}, 1)
        ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "conversation_usage"."count" + 1
        WHERE "conversation_usage"."count" < ${limits.messagesPerDay}
        RETURNING "count"`;
      if (counted.length === 0) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            reason: 'daily-limit',
            message: `Daily limit of ${limits.messagesPerDay} messages reached`,
            retryAt: startOfNextLocalDay(now, user.reminderTimeZone).toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const message = await tx.conversationMessage.create({
        data: { conversationId, position: (last?.position ?? -1) + 1, role: 'User', text, createdAt: now },
        select: MESSAGE_SELECT,
      });
      const history: ChatTurn[] = [...messages]
        .reverse()
        .map((m) => ({ role: m.role === 'User' ? ('user' as const) : ('assistant' as const), text: m.text }));
      history.push({ role: 'user', text });
      return { userId, conversationId, message, day, history, maxReplyWords: limits.maxReplyWords };
    });
  }

  private async saveEvaluation(
    turn: Turn,
    evaluation: Evaluation & { pronunciation?: SpokenPronunciation },
  ): Promise<SavedMessage> {
    return this.prisma.conversationMessage.update({
      where: { id: turn.message.id },
      data: { evaluation: evaluation as unknown as Prisma.InputJsonValue },
      select: MESSAGE_SELECT,
    });
  }

  /** The reply, saved at the end of the stream; the first message of the user titles the conversation. */
  private async saveReply(turn: Turn, text: string): Promise<SavedMessage> {
    const [message] = await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: {
          conversationId: turn.conversationId,
          position: turn.message.position + 1,
          role: 'Assistant',
          text: text.trim().slice(0, MESSAGE_MAX),
        },
        select: MESSAGE_SELECT,
      }),
      this.prisma.conversation.updateMany({ where: { id: turn.conversationId }, data: { updatedAt: new Date() } }),
      this.prisma.conversation.updateMany({
        where: { id: turn.conversationId, title: null },
        data: { title: turn.message.text.replace(/\s+/g, ' ').slice(0, TITLE_MAX) },
      }),
    ]);
    return message;
  }

  /** The provider failed: the message is removed, and it doesn't count for the day. */
  private async giveBack(turn: Turn): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationMessage.deleteMany({ where: { id: turn.message.id } }),
      this.prisma.conversationUsage.updateMany({
        where: { userId: turn.userId, day: turn.day, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      }),
    ]);
    await this.usage.record(turn.userId, { messages: -1 });
  }

  /** Every night: the conversations of more than 90 days, and the old daily counts. */
  @Cron('41 3 * * *', { name: 'conversations-purge', waitForCompletion: true })
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - KEPT_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.conversation.deleteMany({ where: { createdAt: { lt: before } } });
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await this.prisma.conversationUsage.deleteMany({
      // The days of the cards proposed by the AI are prefixed (MEM-139): « ai-lists:2026-11-01 ».
      where: { OR: [{ day: { lt: lastWeek } }, { day: { startsWith: 'ai-lists:', lt: `ai-lists:${lastWeek}` } }] },
    });
    if (count > 0) this.logger.log(`${count} conversations of more than ${KEPT_DAYS} days purged`);
    return count;
  }

  /** The cost of a call of the model: who, how long, how many tokens; never the text. */
  private logUsage(userId: string, call: 'evaluation' | 'reply', durationMs: number, usage: ModelUsage): void {
    void this.usage.record(userId, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }); // MEM-135
    this.logger.log(
      `model call: model=${this.model?.name} call=${call} user=${userId} durationMs=${durationMs} ` +
        `inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens}`,
    );
  }

  private logFailure(userId: string, call: 'evaluation' | 'reply', durationMs: number, error: unknown): void {
    const reason = error instanceof ConversationModelError ? `${error.kind}: ${error.message}` : 'unexpected error';
    this.logger.warn(
      `model call failed: model=${this.model?.name} call=${call} user=${userId} durationMs=${durationMs} (${reason})`,
    );
  }

  private async timeZoneOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { reminderTimeZone: true } });
    return user?.reminderTimeZone ?? 'Europe/Paris';
  }

  /** The model; 503 when the feature is off. */
  private requireModel(): ConversationModel {
    if (!this.model) throw new ServiceUnavailableException(OFF);
    return this.model;
  }

  /** MEM-135: to start a conversation or send a message, the Chat IA must not be off in the console either. */
  private async requireOn(): Promise<ConversationModel> {
    const model = this.requireModel();
    if (!(await this.limits.settingsNow()).enabled) throw new ServiceUnavailableException(OFF_BY_ADMIN);
    return model;
  }
}
