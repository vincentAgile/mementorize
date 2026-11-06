import { sayWithBrowser, silenceBrowser, stopPronouncing } from './speech';

/**
 * MEM-132: the voice of the « Chat IA ». The messages of the AI are read
 * sentence by sentence by Kokoro (the voice of the cards, MEM-39), through
 * the route /anglais/chat/voix; the browser's English voice takes over when
 * Kokoro doesn't answer. A reply is read while it is written: each sentence
 * as soon as it is complete. One reading at a time.
 */

export const VOICE_HREF = '/anglais/chat/voix';
/** The opening question, read in advance on the server: it starts at once. */
export const OPENING_AUDIO_HREF = '/anglais/chat/voix/ouverture';
/** The API reads 500 characters at most at a time. */
export const MAX_SENTENCE = 500;
/** The API reads 3 sentences per second at most: one asked every 400 ms at most. */
const REQUEST_GAP_MS = 400;
/** A sentence refused for going too fast (429) is asked again once, a second later. */
const RETRY_AFTER_MS = 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** Not the end of a sentence: « Mr. Smith », « e.g. this ». */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'jr', 'sr', 'prof', 'mt']);

/** A sentence ends with . ! ? or …, possibly followed by quotes or brackets, then a space. */
const END = /[.!?…]+["'”’)\]]*(?=\s)/g;

/** A sentence longer than the API reads, cut at a comma or a space. */
function bounded(sentence: string): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_SENTENCE) {
    const slice = rest.slice(0, MAX_SENTENCE);
    const cut = Math.max(slice.lastIndexOf(', ') + 1, slice.lastIndexOf(' '));
    const at = cut > MAX_SENTENCE / 2 ? cut : MAX_SENTENCE;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Cuts a text that arrives in pieces into sentences: `push` gives the
 * sentences that a piece completes, `flush` the rest at the end.
 */
export function sentenceSplitter() {
  let buffer = '';
  return {
    push(piece: string): string[] {
      buffer += piece;
      const sentences: string[] = [];
      let start = 0;
      for (const match of buffer.matchAll(END)) {
        const end = match.index + match[0].length;
        const lastWord = /([\p{L}.]+)\.$/u.exec(buffer.slice(start, match.index + 1))?.[1]?.toLowerCase();
        if (match[0].startsWith('.') && match[0].length === 1 && lastWord && ABBREVIATIONS.has(lastWord)) continue;
        const sentence = buffer.slice(start, end).trim();
        // Punctuation alone (« ». » after a quotation) is not read.
        if (/[\p{L}\p{N}]/u.test(sentence)) sentences.push(...bounded(sentence));
        start = end;
      }
      buffer = buffer.slice(start);
      return sentences;
    },
    flush(): string[] {
      const rest = buffer.trim();
      buffer = '';
      return /[\p{L}\p{N}]/u.test(rest) ? bounded(rest) : [];
    },
  };
}

/** The sentences of a whole text. */
export function sentencesOf(text: string): string[] {
  const splitter = sentenceSplitter();
  return [...splitter.push(text), ...splitter.flush()];
}

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

interface Sentence {
  text: string;
  /** An audio already prepared (the opening question), instead of asking the route. */
  url?: string;
  audio?: Promise<string | null>;
}

export type ReadingEnd = 'done' | 'stopped' | 'blocked';

/**
 * The reader of the page: one reading at a time, `owner` says which message
 * is being read (its loudspeaker shows it). `subscribe` and `owner` are for
 * useSyncExternalStore.
 */
export class ChatVoice {
  private queue: Sentence[] = [];
  private current: HTMLAudioElement | null = null;
  /** The generation whose reading loop runs, if any. */
  private running: number | null = null;
  /** Grows at each stop: a reading of an older generation stops at its next step. */
  private generation = 0;
  private owned: string | null = null;
  /** Kokoro said it isn't there (503): the browser's voice from now on. */
  private kokoroOff = false;
  /** When the next sentence may be asked for. */
  private nextRequestAt = 0;
  private readonly listeners = new Set<() => void>();
  private waiting: ((end: ReadingEnd) => void) | null = null;

  constructor(
    private readonly fetchAudio: (text: string) => Promise<Response> = (text) =>
      fetch(VOICE_HREF, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }),
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  owner = (): string | null => this.owned;

  /** Reads these sentences now, for this message: the reading in progress stops. */
  speak(key: string, sentences: (string | Sentence)[]): Promise<ReadingEnd> {
    this.stop();
    this.setOwner(key);
    const done = new Promise<ReadingEnd>((resolve) => (this.waiting = resolve));
    this.enqueue(sentences);
    return done;
  }

  /** More sentences of the message being read (a reply being written); a new reading otherwise. */
  append(key: string, sentences: string[]): void {
    if (sentences.length === 0) return;
    if (this.owned !== key) {
      void this.speak(key, sentences);
      return;
    }
    this.enqueue(sentences);
  }

  /** The message read changes its key (the reply written, saved). */
  rename(from: string, to: string): void {
    if (this.owned === from) this.setOwner(to);
  }

  /** Stops everything: leaving the page, sending a message, recording one's voice. */
  stop(): void {
    this.generation++;
    this.queue = [];
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
    silenceBrowser();
    this.finish('stopped');
  }

  private enqueue(sentences: (string | Sentence)[]): void {
    for (const sentence of sentences) this.queue.push(typeof sentence === 'string' ? { text: sentence } : sentence);
    if (this.running !== this.generation) void this.run(this.generation);
  }

  private load(sentence: Sentence): Promise<string | null> {
    sentence.audio ??= (async () => {
      if (sentence.url) return sentence.url;
      if (this.kokoroOff) return null;
      try {
        let response = await this.paced(sentence.text);
        if (response.status === 429) {
          await wait(RETRY_AFTER_MS);
          response = await this.paced(sentence.text);
        }
        if (response.status === 503) this.kokoroOff = true;
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
      } catch {
        return null;
      }
    })();
    return sentence.audio;
  }

  /** Asks for a sentence, never faster than the API allows. */
  private async paced(text: string): Promise<Response> {
    const now = Date.now();
    const at = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = at + REQUEST_GAP_MS;
    if (at > now) await wait(at - now);
    return this.fetchAudio(text);
  }

  private async run(generation: number): Promise<void> {
    this.running = generation;
    try {
      while (this.queue.length > 0 && generation === this.generation) {
        const sentence = this.queue.shift()!;
        const url = await this.load(sentence);
        if (generation !== this.generation) return;
        // The next one is asked for while this one is read.
        if (this.queue[0]) void this.load(this.queue[0]);
        const end = url ? await this.play(url, generation) : null;
        if (url && !sentence.url) URL.revokeObjectURL(url);
        if (end === 'blocked') {
          this.queue = [];
          this.finish('blocked');
          return;
        }
        if (!url || end === 'failed') {
          if (generation !== this.generation) return;
          await sayWithBrowser(sentence.text);
        }
      }
      if (generation === this.generation) this.finish('done');
    } finally {
      if (this.running === generation) this.running = null;
    }
  }

  private play(url: string, generation: number): Promise<'ended' | 'blocked' | 'failed'> {
    return new Promise((resolve) => {
      const element = new Audio(url);
      this.current = element;
      const settle = (end: 'ended' | 'blocked' | 'failed') => {
        if (this.current === element) this.current = null;
        resolve(end);
      };
      element.onended = () => settle('ended');
      element.onerror = () => settle(generation === this.generation ? 'failed' : 'ended');
      element.onpause = () => {
        if (generation !== this.generation) settle('ended');
      };
      element.play().catch((error: unknown) => {
        // Before any gesture of the user, the browser refuses the sound.
        settle(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'failed');
      });
    });
  }

  private finish(end: ReadingEnd): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.(end);
    this.setOwner(null);
  }

  private setOwner(key: string | null): void {
    if (this.owned === key) return;
    this.owned = key;
    for (const listener of this.listeners) listener();
  }
}

/** The reader of the page, created on first use (in the browser only). */
let voice: ChatVoice | null = null;
export function chatVoice(): ChatVoice {
  if (!voice) {
    stopPronouncing(); // the pronunciation of a card, if one was still being read
    voice = new ChatVoice();
  }
  return voice;
}
