import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_VOICE, KokoroClient } from './kokoro.client.js';
import { englishOf, PronunciationService } from './pronunciation.service.js';

const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x44]);

describe('PronunciationService', () => {
  let service: PronunciationService;
  const kokoro = { enabled: true, voice: 'af_heart', speak: vi.fn() };
  const prismaMock = {
    item: { findMany: vi.fn(), findUnique: vi.fn() },
    pronunciation: { upsert: vi.fn(), findFirst: vi.fn() },
  };
  const vocabulary = (word: string, pronunciation: { text: string; voice: string } | null = null) => ({
    type: 'Vocabulary',
    content: { word, translation: 'x', example: null },
    pronunciation,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    kokoro.enabled = true;
    kokoro.speak.mockResolvedValue({ audio: mp3, mimeType: 'audio/mpeg' });
    const module = await Test.createTestingModule({
      providers: [
        PronunciationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: KokoroClient, useValue: kokoro },
      ],
    }).compile();
    service = module.get(PronunciationService);
  });

  afterEach(() => service.onModuleDestroy());

  it('reads the English of a vocabulary content', () => {
    expect(englishOf({ word: '  to grasp ' })).toBe('to grasp');
    expect(englishOf({ word: '' })).toBeNull();
    expect(englishOf({ text: 'a quote' })).toBeNull();
    expect(englishOf(null)).toBeNull();
  });

  it('generates and stores the audio of the English with the voice', async () => {
    prismaMock.item.findUnique.mockResolvedValue(vocabulary('to grasp'));

    await expect(service.generate('item-1')).resolves.toBe(true);

    expect(kokoro.speak).toHaveBeenCalledWith('to grasp');
    expect(prismaMock.pronunciation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId: 'item-1' },
        create: { itemId: 'item-1', text: 'to grasp', voice: 'af_heart', audio: mp3, mimeType: 'audio/mpeg' },
      }),
    );
  });

  it('leaves an up-to-date pronunciation alone', async () => {
    prismaMock.item.findUnique.mockResolvedValue(vocabulary('to grasp', { text: 'to grasp', voice: 'af_heart' }));
    await expect(service.generate('item-1')).resolves.toBe(false);
    expect(kokoro.speak).not.toHaveBeenCalled();
  });

  it('generates again when the English or the voice changed', async () => {
    prismaMock.item.findUnique.mockResolvedValue(vocabulary('to grasp', { text: 'to grab', voice: 'af_heart' }));
    await expect(service.generate('item-1')).resolves.toBe(true);
    prismaMock.item.findUnique.mockResolvedValue(vocabulary('to grasp', { text: 'to grasp', voice: 'bf_emma' }));
    await expect(service.generate('item-1')).resolves.toBe(true);
    expect(kokoro.speak).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a deleted item or another type', async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    await expect(service.generate('gone')).resolves.toBe(false);
    prismaMock.item.findUnique.mockResolvedValue({ type: 'Quote', content: { text: 'x' }, pronunciation: null });
    await expect(service.generate('quote')).resolves.toBe(false);
    expect(kokoro.speak).not.toHaveBeenCalled();
  });

  it('works through the requests in the background, one at a time', async () => {
    prismaMock.item.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(vocabulary(`word ${where.id}`)),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    kokoro.speak.mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { audio: mp3, mimeType: 'audio/mpeg' };
    });

    service.request('a');
    service.request('b');
    service.request('b'); // already waiting: not queued twice
    await vi.waitFor(() => expect(prismaMock.pronunciation.upsert).toHaveBeenCalledTimes(2));

    expect(maxInFlight).toBe(1);
    expect(kokoro.speak.mock.calls.map(([text]) => text)).toEqual(['word a', 'word b']);
  });

  it('keeps going after a failure, and tries again later', async () => {
    vi.useFakeTimers();
    try {
      prismaMock.item.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(vocabulary(`word ${where.id}`)),
      );
      kokoro.speak.mockRejectedValueOnce(new Error('Kokoro is starting'));

      service.request('a');
      service.request('b');
      await vi.waitFor(() => expect(prismaMock.pronunciation.upsert).toHaveBeenCalledTimes(1)); // b
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.waitFor(() => expect(prismaMock.pronunciation.upsert).toHaveBeenCalledTimes(2)); // a, again
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when Kokoro is not configured', async () => {
    kokoro.enabled = false;
    service.request('a');
    service.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(prismaMock.item.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.item.findMany).not.toHaveBeenCalled();
  });

  it('catches up the missing and out-of-date pronunciations', async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'ok', ...vocabulary('fine', { text: 'fine', voice: 'af_heart' }) },
      { id: 'missing', ...vocabulary('new') },
      { id: 'edited', ...vocabulary('newer', { text: 'older', voice: 'af_heart' }) },
      { id: 'voice', ...vocabulary('same', { text: 'same', voice: 'bf_emma' }) },
    ]);
    prismaMock.item.findUnique.mockResolvedValue(null); // the queue itself isn't under test here

    await expect(service.catchUp()).resolves.toBe(3);
  });

  describe('find', () => {
    it("serves the audio of the user's item when it matches its English", async () => {
      prismaMock.pronunciation.findFirst.mockResolvedValue({
        text: 'to grasp',
        audio: mp3,
        mimeType: 'audio/mpeg',
        item: { content: { word: 'to grasp' } },
      });

      await expect(service.find('user-1', 'item-1')).resolves.toEqual({ audio: mp3, mimeType: 'audio/mpeg' });
      expect(prismaMock.pronunciation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { itemId: 'item-1', item: { userId: 'user-1', type: 'Vocabulary' } } }),
      );
    });

    it('never serves the audio of a former English', async () => {
      prismaMock.pronunciation.findFirst.mockResolvedValue({
        text: 'to grab',
        audio: mp3,
        mimeType: 'audio/mpeg',
        item: { content: { word: 'to grasp' } },
      });
      await expect(service.find('user-1', 'item-1')).resolves.toBeNull();
    });

    it('finds nothing for an item of someone else, or without audio', async () => {
      prismaMock.pronunciation.findFirst.mockResolvedValue(null);
      await expect(service.find('user-2', 'item-1')).resolves.toBeNull();
    });
  });
});

describe('KokoroClient', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (name: string) => values[name] }) as unknown as ConfigService;

  afterEach(() => vi.unstubAllGlobals());

  it('is disabled without KOKORO_URL, with the default voice', () => {
    const client = new KokoroClient(config({}));
    expect(client.enabled).toBe(false);
    expect(client.voice).toBe(DEFAULT_VOICE);
  });

  it("asks Kokoro's OpenAI-compatible endpoint for an MP3 of the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(mp3, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new KokoroClient(config({ KOKORO_URL: 'http://kokoro:8880/', KOKORO_VOICE: 'bf_emma' }));

    const speech = await client.speak('snag');

    expect(speech).toEqual({ audio: mp3, mimeType: 'audio/mpeg' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://kokoro:8880/v1/audio/speech');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'kokoro',
      input: 'snag',
      voice: 'bf_emma',
      response_format: 'mp3',
      speed: 1,
    });
  });

  it('fails on an error or an empty answer', async () => {
    const client = new KokoroClient(config({ KOKORO_URL: 'http://kokoro:8880' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('voice not found', { status: 400 })));
    await expect(client.speak('snag')).rejects.toThrow('Kokoro answered 400: voice not found');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(), { status: 200 })));
    await expect(client.speak('snag')).rejects.toThrow('empty');
  });
});
