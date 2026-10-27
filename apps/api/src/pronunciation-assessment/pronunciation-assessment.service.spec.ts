import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  InvalidRecordingError,
  type PronunciationAssessment,
  type PronunciationAssessor,
  type Recording,
  VoiceUnavailableError,
} from '../voice/pronunciation-assessor.js';
import { PronunciationAssessmentService } from './pronunciation-assessment.service.js';

/** The fake implementation of the voice layer: remembers what it was asked. */
class FakeAssessor implements PronunciationAssessor {
  calls: { recording: Recording; text: string; bytes: string }[] = [];
  failure: Error | null = null;
  async assess(recording: Recording, text: string): Promise<PronunciationAssessment> {
    this.calls.push({ recording, text, bytes: recording.data.toString('hex') });
    if (this.failure) throw this.failure;
    return { nothingHeard: false, score: 90, accuracy: 90, fluency: 100, completeness: 100, words: [] };
  }
}

const status = (promise: Promise<unknown>) => promise.catch((error: HttpException) => error.getStatus());

describe('PronunciationAssessmentService (MEM-90)', () => {
  const prisma = {
    item: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  };
  let fake: FakeAssessor;
  let service: PronunciationAssessmentService;
  const recording = () => ({ data: Buffer.from('audio bytes'), mimeType: 'audio/webm' });
  const ITEM = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    prisma.item.findFirst.mockReset().mockResolvedValue({ content: { word: ' to cherish ', translation: 'chérir' } });
    prisma.$queryRaw.mockReset().mockResolvedValue([{ count: 1 }]);
    fake = new FakeAssessor();
    service = new PronunciationAssessmentService(
      prisma as unknown as PrismaService,
      fake,
      new ConfigService({ PRONUNCIATION_PER_MINUTE: '3', PRONUNCIATION_PER_DAY: '50' }),
    );
  });

  it('assesses against the English of the user’s own vocabulary item, read in the database', async () => {
    const result = await service.assess('user-1', ITEM, recording());

    expect(result.score).toBe(90);
    expect(fake.calls[0].text).toBe('to cherish');
    expect(prisma.item.findFirst).toHaveBeenCalledWith({
      where: { id: ITEM, userId: 'user-1', type: 'Vocabulary' },
      select: { content: true },
    });
  });

  it('never keeps the recording: wiped once assessed, even after a failure', async () => {
    const one = recording();
    await service.assess('user-1', ITEM, one);
    expect(one.data.every((byte) => byte === 0)).toBe(true);
    expect(fake.calls[0].bytes).toBe(Buffer.from('audio bytes').toString('hex')); // sent before being wiped

    fake.failure = new VoiceUnavailableError('down');
    const two = recording();
    await expect(service.assess('user-1', ITEM, two)).rejects.toThrow();
    expect(two.data.every((byte) => byte === 0)).toBe(true);
  });

  it('is off without a provider (503), and 404 for another user’s item or a quote', async () => {
    const off = new PronunciationAssessmentService(prisma as unknown as PrismaService, null, new ConfigService({}));
    expect(off.enabled).toBe(false);
    expect(await status(off.assess('user-1', ITEM, recording()))).toBe(503);

    prisma.item.findFirst.mockResolvedValueOnce(null);
    expect(await status(service.assess('user-1', ITEM, recording()))).toBe(404);
    expect(fake.calls).toHaveLength(0);
  });

  it('limits the assessments per user and per minute', async () => {
    const now = new Date('2026-10-27T20:00:00Z');
    for (let i = 0; i < 3; i++) await service.assess('user-1', ITEM, recording(), now);
    expect(await status(service.assess('user-1', ITEM, recording(), now))).toBe(429);
    await expect(service.assess('user-2', ITEM, recording(), now)).resolves.toBeTruthy(); // another user
    await expect(service.assess('user-1', ITEM, recording(), new Date(now.getTime() + 61_000))).resolves.toBeTruthy();
  });

  it('caps the assessments of a user per day (counted in the database, atomically)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]); // the cap is reached: no row updated
    expect(await status(service.assess('user-1', ITEM, recording()))).toBe(429);
    expect(fake.calls).toHaveLength(0);
    const query = prisma.$queryRaw.mock.calls[0];
    expect(query.slice(1)).toEqual(['user-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 50]);
  });

  it('turns the errors of the voice layer into clear answers', async () => {
    fake.failure = new VoiceUnavailableError('timeout');
    expect(await status(service.assess('user-1', ITEM, recording()))).toBe(503);
    fake.failure = new InvalidRecordingError('too-long');
    expect(await status(service.assess('user-1', ITEM, recording()))).toBe(413);
    fake.failure = new InvalidRecordingError('too-short');
    expect(await status(service.assess('user-1', ITEM, recording()))).toBe(400);
  });
});
