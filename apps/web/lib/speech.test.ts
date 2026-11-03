// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A fake <audio>: plays at once, ends when the test says so. */
class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  preload = '';
  currentTime = 0;
  paused = true;
  ended = false;
  onended: (() => void) | null = null;
  plays = 0;
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener() {}
  play() {
    this.paused = false;
    this.ended = false;
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  finish() {
    this.paused = true;
    this.ended = true;
    this.onended?.();
  }
}
const audioOf = (url: string) => FakeAudio.all.find((audio) => audio.src === url)!;
/** How many times an audio was played: 0 when not even loaded yet. */
const plays = (url: string) => FakeAudio.all.find((audio) => audio.src === url)?.plays ?? 0;

/** A fake speech synthesis: a sentence cut by cancel() ends later, with an error, as in Chrome. */
class FakeUtterance {
  voice: unknown = null;
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const said: string[] = [];
let current: FakeUtterance | null = null;
const fakeSynthesis = {
  getVoices: () => [{ lang: 'en-US', localService: true }],
  addEventListener() {},
  speak(utterance: FakeUtterance) {
    current = utterance;
    said.push(utterance.text);
  },
  cancel() {
    const cut = current;
    current = null;
    if (cut) setTimeout(() => cut.onerror?.());
  },
};
const finishSpeaking = () => {
  const done = current;
  current = null;
  done?.onend?.();
};

async function speech() {
  vi.resetModules();
  return import('./speech');
}

describe('speech: the English of the next card waits for the one being read', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    said.length = 0;
    current = null;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', { value: fakeSynthesis, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('« after »: plays once the reading in progress has ended, never cutting it', async () => {
    const { pronounce } = await speech();
    pronounce('a snag', '/a.mp3');
    pronounce('a stakeholder', '/b.mp3', { after: true });
    expect(audioOf('/a.mp3').paused).toBe(false);
    expect(plays('/b.mp3')).toBe(0);
    audioOf('/a.mp3').finish();
    expect(plays('/b.mp3')).toBe(1);
  });

  it('only the last one asked waits: no series of old words', async () => {
    const { pronounce } = await speech();
    pronounce('a snag', '/a.mp3');
    pronounce('a stakeholder', '/b.mp3', { after: true });
    pronounce('a bottleneck', '/c.mp3', { after: true });
    audioOf('/a.mp3').finish();
    expect(plays('/b.mp3')).toBe(0);
    expect(plays('/c.mp3')).toBe(1);
  });

  it('nothing being read: at once; the loudspeaker cuts and starts again', async () => {
    const { pronounce } = await speech();
    pronounce('a snag', '/a.mp3', { after: true });
    expect(plays('/a.mp3')).toBe(1);
    pronounce('a stakeholder', '/b.mp3');
    expect(audioOf('/a.mp3').paused).toBe(true);
    expect(plays('/b.mp3')).toBe(1);
  });

  it('stopPronouncing (leaving, recording): the reading and the one waiting', async () => {
    const { pronounce, stopPronouncing } = await speech();
    pronounce('a snag', '/a.mp3');
    pronounce('a stakeholder', '/b.mp3', { after: true });
    stopPronouncing();
    audioOf('/a.mp3').finish();
    expect(audioOf('/a.mp3').paused).toBe(true);
    expect(plays('/b.mp3')).toBe(0);
  });

  it('with the browser’s voice too; a sentence cut earlier doesn’t start the one waiting', async () => {
    vi.useFakeTimers();
    const { pronounce } = await speech();
    pronounce('a snag');
    pronounce('a hiccup'); // cuts « a snag », whose error comes later
    pronounce('a stakeholder', undefined, { after: true });
    vi.runAllTimers(); // the error of « a snag »
    expect(said).toEqual(['a snag', 'a hiccup']);
    finishSpeaking(); // « a hiccup » is over
    expect(said).toEqual(['a snag', 'a hiccup', 'a stakeholder']);
  });
});
