import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginLimiter } from '../admin/login-limiter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { englishOf } from '../pronunciation/pronunciation.service.js';
import {
  InvalidRecordingError,
  PRONUNCIATION_ASSESSOR,
  type PronunciationAssessment,
  type PronunciationAssessor,
  type Recording,
  VoiceUnavailableError,
} from '../voice/pronunciation-assessor.js';

export const DEFAULT_PER_MINUTE = 10;
export const DEFAULT_PER_DAY = 100;

/**
 * The assessment of the pronunciation of a vocabulary item (MEM-90),
 * through the voice layer. The reference text is the item's English, read
 * here: never given by the browser. Limits per user, per minute and per day,
 * to keep the cost in hand if the app is shared. The recording is never
 * kept: not stored, not logged, wiped from memory once assessed.
 */
@Injectable()
export class PronunciationAssessmentService {
  private readonly perMinute: LoginLimiter;
  private readonly perDay: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRONUNCIATION_ASSESSOR) private readonly assessor: PronunciationAssessor | null,
    config: ConfigService,
  ) {
    this.perMinute = new LoginLimiter(Number(config.get('PRONUNCIATION_PER_MINUTE') ?? DEFAULT_PER_MINUTE), 60_000);
    this.perDay = Number(config.get('PRONUNCIATION_PER_DAY') ?? DEFAULT_PER_DAY);
  }

  /** Whether the assessment is offered (a provider is configured). */
  get enabled(): boolean {
    return this.assessor !== null;
  }

  async assess(
    userId: string,
    itemId: string,
    recording: Recording,
    now = new Date(),
  ): Promise<PronunciationAssessment> {
    try {
      if (!this.assessor) throw new ServiceUnavailableException('Pronunciation assessment is off');
      const item = await this.prisma.item.findFirst({
        where: { id: itemId, userId, type: 'Vocabulary' },
        select: { content: true },
      });
      const referenceText = item && englishOf(item.content);
      if (!referenceText) throw new NotFoundException('Vocabulary item not found');

      if (this.perMinute.blocked(userId, now.getTime())) {
        throw new HttpException('Too many assessments: wait a minute', HttpStatus.TOO_MANY_REQUESTS);
      }
      this.perMinute.fail(userId, now.getTime()); // counts the attempt
      if (!(await this.countToday(userId, now))) {
        throw new HttpException('Daily limit of assessments reached', HttpStatus.TOO_MANY_REQUESTS);
      }

      return await this.assessor.assess(recording, referenceText);
    } catch (error) {
      if (error instanceof InvalidRecordingError) {
        if (error.reason === 'too-long') throw new PayloadTooLargeException('Recording longer than 10 seconds');
        throw new BadRequestException(error.reason === 'too-short' ? 'Recording too short' : 'Unreadable recording');
      }
      if (error instanceof VoiceUnavailableError) {
        throw new ServiceUnavailableException('Pronunciation assessment unavailable');
      }
      throw error;
    } finally {
      recording.data.fill(0); // never kept, even in memory
    }
  }

  /** One more assessment today; false if the daily cap is reached. Atomic: two at once can't pass it. */
  private async countToday(userId: string, now: Date): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "pronunciation_usage" ("userId", "day", "count") VALUES (${userId}, ${day}, 1)
      ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "pronunciation_usage"."count" + 1
      WHERE "pronunciation_usage"."count" < ${this.perDay}
      RETURNING "count"`;
    return rows.length === 1;
  }
}
