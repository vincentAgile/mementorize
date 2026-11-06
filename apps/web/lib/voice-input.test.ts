import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSpeechToken,
  insertSpoken,
  MIC_DENIED,
  microphoneError,
  NO_MIC,
  sameText,
  scoresOf,
  summarizePronunciation,
  VOICE_LIMIT,
  VOICE_UNAVAILABLE,
} from './voice-input';

describe('voice input (MEM-133)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the spoken text at the cursor, with the spaces it needs, without removing what is typed', () => {
    expect(insertSpoken('', 0, 'hello there')).toEqual({ value: 'hello there', inserted: 'hello there' });
    expect(insertSpoken('I think.', 7, 'it is fine')).toEqual({
      value: 'I think it is fine.',
      inserted: ' it is fine',
    });
    expect(insertSpoken('Yes. Bye', 4, 'Good idea.')).toEqual({
      value: 'Yes. Good idea. Bye',
      inserted: ' Good idea.',
    });
    expect(insertSpoken('Same', 4, '   ')).toEqual({ value: 'Same', inserted: '' });
    expect(sameText(' I like  films. ', 'I like films.')).toBe(true);
  });

  it('reads the scores of a sentence in Azure’s answer', () => {
    const json = JSON.stringify({
      NBest: [
        {
          PronunciationAssessment: { AccuracyScore: 80, FluencyScore: 90, CompletenessScore: 100, PronScore: 85 },
          Words: [
            { Word: 'I', PronunciationAssessment: { AccuracyScore: 98, ErrorType: 'None' } },
            { Word: 'thought', PronunciationAssessment: { AccuracyScore: 45, ErrorType: 'Mispronunciation' } },
          ],
        },
      ],
    });
    expect(scoresOf(json)).toEqual({
      score: 85,
      accuracy: 80,
      fluency: 90,
      completeness: 100,
      words: [
        { word: 'I', accuracy: 98, error: 'None' },
        { word: 'thought', accuracy: 45, error: 'Mispronunciation' },
      ],
    });
    expect(scoresOf('{"NBest":[{}]}')).toBeNull();
    expect(scoresOf('nope')).toBeNull();
  });

  it('sums the pronunciation of the sentences up, weighted by their words', () => {
    const word = (w: string, accuracy = 95, error = 'None') => ({ word: w, accuracy, error });
    expect(
      summarizePronunciation([
        {
          score: 90,
          accuracy: 90,
          fluency: 100,
          completeness: 100,
          words: [word('I'), word('like'), word('Thought', 50)],
        },
        { score: 60, accuracy: 60, fluency: 70, completeness: null, words: [word('thought', 40, 'Mispronunciation')] },
      ]),
    ).toEqual({ score: 82.5, accuracy: 82.5, fluency: 92.5, completeness: null, words: ['thought'] });
    expect(summarizePronunciation([])).toBeNull();
  });

  it('says why the microphone or the token is refused', async () => {
    expect(microphoneError(new DOMException('no', 'NotAllowedError'))).toBe(MIC_DENIED);
    expect(microphoneError(new DOMException('no', 'NotFoundError'))).toBe(NO_MIC);
    expect(microphoneError(new Error('?'))).toBe(VOICE_UNAVAILABLE);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    expect(await fetchSpeechToken()).toEqual({ error: VOICE_LIMIT });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    expect(await fetchSpeechToken()).toEqual({ error: VOICE_UNAVAILABLE });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ token: 't', region: 'r', expiresAt: 'x' })),
    );
    expect(await fetchSpeechToken()).toEqual({ token: 't', region: 'r', expiresAt: 'x' });
  });
});
