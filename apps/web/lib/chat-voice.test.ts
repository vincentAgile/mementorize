// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sayWithBrowser = vi.fn<(text: string) => Promise<void>>(async () => undefined);
vi.mock('./speech', () => ({ sayWithBrowser, silenceBrowser: vi.fn(), stopPronouncing: vi.fn() }));

const { ChatVoice, MAX_SENTENCE, sentenceSplitter, sentencesOf } = await import('./chat-voice');

describe('sentenceSplitter (MEM-132)', () => {
  it('gives each sentence as soon as it is complete, while the reply is written', () => {
    const splitter = sentenceSplitter();
    expect(splitter.push('Hello the')).toEqual([]);
    expect(splitter.push('re! How are')).toEqual(['Hello there!']);
    expect(splitter.push(' you? I')).toEqual(['How are you?']);
    expect(splitter.push('’m fine. Mr. Smith says “hi.” Bye')).toEqual(['I’m fine.', 'Mr. Smith says “hi.”']);
    expect(splitter.flush()).toEqual(['Bye']);
    expect(splitter.flush()).toEqual([]);
    // Punctuation alone, after a quotation, is not read.
    expect(sentencesOf('You said: « Hello. ». Tell me more?')).toEqual(['You said: « Hello.', 'Tell me more?']);
  });

  it('cuts the whole text of a message, and the sentences too long for the API', () => {
    expect(sentencesOf('Nice! What did you see…  Tell me, e.g. the title.')).toEqual([
      'Nice!',
      'What did you see…',
      'Tell me, e.g. the title.',
    ]);
    const long = `${'word '.repeat(150)}end.`;
    const parts = sentencesOf(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= MAX_SENTENCE)).toBe(true);
    expect(parts.join(' ')).toBe(long.trim());
  });
});

/** An `<audio>` that plays what it is given; the test ends each one. */
class FakeAudio {
  static played: FakeAudio[] = [];
  static refuse: string | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  constructor(readonly src: string) {}
  play() {
    if (FakeAudio.refuse) return Promise.reject(new DOMException('No sound yet', FakeAudio.refuse));
    FakeAudio.played.push(this);
    return Promise.resolve();
  }
  pause() {
    this.onpause?.();
  }
}

/** Long enough for a sentence asked at the pace of the API (one every 400 ms). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('ChatVoice (MEM-132)', () => {
  const fetchAudio = vi.fn(async (text: string) => new Response(new Blob([`mp3:${text}`]), { status: 200 }));

  beforeEach(() => {
    FakeAudio.played = [];
    FakeAudio.refuse = null;
    vi.stubGlobal('Audio', FakeAudio);
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
    fetchAudio.mockClear();
    sayWithBrowser.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the sentences one after the other with Kokoro, asking for the next one meanwhile', async () => {
    const voice = new ChatVoice(fetchAudio);
    const end = voice.speak('m1', ['Hello there!', 'How are you?']);
    await settle();
    expect(voice.owner()).toBe('m1');
    expect(fetchAudio.mock.calls.map(([text]) => text)).toEqual(['Hello there!', 'How are you?']);
    expect(FakeAudio.played).toHaveLength(1);

    FakeAudio.played[0].onended?.();
    await settle();
    expect(FakeAudio.played).toHaveLength(2);
    voice.append('m1', ['And you?']); // a reply still being written
    FakeAudio.played[1].onended?.();
    await settle();
    FakeAudio.played[2].onended?.();
    expect(await end).toBe('done');
    expect(voice.owner()).toBeNull();
    expect(sayWithBrowser).not.toHaveBeenCalled();
  });

  it('asks for the sentences at the pace the API allows, and once more after a 429', async () => {
    const answers = [429, 200, 200];
    const times: number[] = [];
    const paced = vi.fn(async (text: string) => {
      times.push(Date.now());
      return new Response(new Blob([text]), { status: answers.shift() ?? 200 });
    });
    const voice = new ChatVoice(paced);
    const end = voice.speak('m1', ['One.', 'Two.']);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(paced.mock.calls.map(([text]) => text)).toEqual(['One.', 'One.', 'Two.']);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(990); // asked again a second later
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(390); // never more than one every 400 ms
    FakeAudio.played[0]?.onended?.();
    await flush();
    FakeAudio.played[1]?.onended?.();
    expect(await end).toBe('done');
    expect(sayWithBrowser).not.toHaveBeenCalled();
  });

  it('falls back on the browser’s voice when Kokoro doesn’t answer', async () => {
    const off = vi.fn(async () => new Response(null, { status: 503 }));
    const voice = new ChatVoice(off);
    expect(await voice.speak('m1', ['Hello there!', 'How are you?'])).toBe('done');
    expect(sayWithBrowser.mock.calls.map(([text]) => text)).toEqual(['Hello there!', 'How are you?']);
    expect(off).toHaveBeenCalledTimes(1); // 503: Kokoro isn't asked again
    expect(FakeAudio.played).toEqual([]);
  });

  it('stops: nothing more is read', async () => {
    const voice = new ChatVoice(fetchAudio);
    const end = voice.speak('m1', ['One.', 'Two.', 'Three.']);
    await flush();
    voice.stop();
    expect(await end).toBe('stopped');
    expect(voice.owner()).toBeNull();
    FakeAudio.played[0]?.onended?.();
    await flush();
    expect(FakeAudio.played).toHaveLength(1);
    expect(sayWithBrowser).not.toHaveBeenCalled();
  });

  it('plays the opening question prepared in advance, without asking Kokoro, and says when the browser refuses', async () => {
    const voice = new ChatVoice(fetchAudio);
    const end = voice.speak('opening', [{ text: 'What do you want to talk about today?', url: '/opening.mp3' }]);
    await flush();
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(FakeAudio.played[0].src).toBe('/opening.mp3');
    FakeAudio.played[0].onended?.();
    expect(await end).toBe('done');

    FakeAudio.refuse = 'NotAllowedError';
    expect(await voice.speak('opening', [{ text: 'What?', url: '/opening.mp3' }])).toBe('blocked');
    expect(sayWithBrowser).not.toHaveBeenCalled();
  });
});
