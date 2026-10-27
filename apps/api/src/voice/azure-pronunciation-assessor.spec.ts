import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AzurePronunciationAssessor, header, normalize } from './azure-pronunciation-assessor.js';
import { VoiceUnavailableError } from './pronunciation-assessor.js';

// Answers recorded from Azure during the trial of MEM-93 (France Central, en-US).
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('Azure pronunciation assessment (MEM-90)', () => {
  describe('normalize: the recorded answers, in the terms of the voice layer', () => {
    it('a careful « apple »: a good score, nothing to detail', () => {
      const result = normalize(fixture('apple-careful'), 'apple');
      expect(result).toMatchObject({ nothingHeard: false, score: 89, accuracy: 89, fluency: 100, completeness: 100 });
      expect(result.words).toEqual([{ word: 'apple', score: 89, error: 'none' }]);
    });

    it('a faulty « apple »: the accuracy as the score of a single word, and its sounds', () => {
      const result = normalize(fixture('apple-faulty'), 'apple');
      // The overall score of Azure (PronScore 22.4) drops for a single word: the accuracy is shown.
      expect(result).toMatchObject({ nothingHeard: false, score: 53, accuracy: 53 });
      expect(result.words[0]).toEqual({
        word: 'apple',
        score: 53,
        error: 'mispronunciation',
        phonemes: [
          { phoneme: 'æ', score: 54 },
          { phoneme: 'p', score: 52 },
          { phoneme: 'ə', score: 36 },
          { phoneme: 'l', score: 36 },
        ],
      });
    });

    it('a faulty « thorough »: the sounds at fault, in IPA', () => {
      const phonemes = normalize(fixture('thorough-faulty'), 'thorough').words[0].phonemes!;
      expect(phonemes.map((ph) => ph.phoneme)).toEqual(['θ', 'ɝ', 'ɹ', 'oʊ']);
      expect(Math.max(...phonemes.map((ph) => ph.score))).toBeLessThan(40);
    });

    it('nothing heard (silence, too quiet): not a bad pronunciation', () => {
      expect(normalize(fixture('nothing-heard'), 'world')).toMatchObject({ nothingHeard: true, score: 0 });
      expect(normalize({ RecognitionStatus: 'InitialSilenceTimeout' }, 'world').nothingHeard).toBe(true);
    });

    it('several words: the overall score of the provider', () => {
      const result = normalize(
        {
          RecognitionStatus: 'Success',
          DisplayText: 'By the way.',
          NBest: [
            {
              Lexical: 'by the way',
              AccuracyScore: 90,
              FluencyScore: 80,
              CompletenessScore: 67,
              PronScore: 78.5,
              Words: [
                { Word: 'by', AccuracyScore: 95, ErrorType: 'None' },
                { Word: 'the', AccuracyScore: 0, ErrorType: 'Omission' },
                { Word: 'way', AccuracyScore: 85, ErrorType: 'None' },
              ],
            },
          ],
        },
        'by the way',
      );
      expect(result).toMatchObject({ nothingHeard: false, score: 78.5, completeness: 67 });
      expect(result.words.map((word) => word.error)).toEqual(['none', 'omission', 'none']);
    });
  });

  it('asks for the reference text, down to the phoneme in IPA, without prosody', () => {
    const params = JSON.parse(Buffer.from(header('to take for granted'), 'base64').toString('utf8'));
    expect(params).toEqual({
      ReferenceText: 'to take for granted',
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableMiscue: 'True',
      PhonemeAlphabet: 'IPA',
    });
  });

  describe.skipIf(!hasFfmpeg)('assess, against a fake Azure', () => {
    let server: http.Server;
    let endpoint: string;
    let answer: { status: number; body: unknown; delayMs?: number } = { status: 200, body: {} };
    let last: { url: string; headers: http.IncomingHttpHeaders; size: number } | undefined;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        let size = 0;
        req.on('data', (chunk: Buffer) => (size += chunk.length));
        req.on('end', () => {
          last = { url: req.url ?? '', headers: req.headers, size };
          setTimeout(() => {
            res.statusCode = answer.status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(answer.body));
          }, answer.delayMs ?? 0);
        });
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise((resolve) => server.close(resolve)));

    const webm = () =>
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=1',
        '-c:a',
        'libopus',
        '-f',
        'webm',
        'pipe:1',
      ]);

    it('converts the browser recording to WAV 16 kHz, and sends it with the key and the text', async () => {
      answer = { status: 200, body: fixture('apple-careful') };
      const assessor = new AzurePronunciationAssessor('secret-key', 'francecentral', endpoint);

      const result = await assessor.assess({ data: webm(), mimeType: 'audio/webm' }, 'apple');

      expect(result.score).toBe(89);
      expect(last!.url).toBe('/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed');
      expect(last!.url).not.toContain('storeAudio'); // nothing kept by Azure
      expect(last!.headers['ocp-apim-subscription-key']).toBe('secret-key');
      expect(last!.headers['content-type']).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
      expect(last!.size).toBe(44 + 32_000); // one second of WAV 16 kHz mono
    });

    it('is unavailable when Azure refuses or fails', async () => {
      const assessor = new AzurePronunciationAssessor('wrong-key', 'francecentral', endpoint);
      for (const status of [401, 429, 500]) {
        answer = { status, body: { error: 'x' } };
        await expect(assessor.assess({ data: webm(), mimeType: 'audio/webm' }, 'apple')).rejects.toThrow(
          VoiceUnavailableError,
        );
      }
      const unreachable = new AzurePronunciationAssessor('key', 'francecentral', 'http://127.0.0.1:1');
      await expect(unreachable.assess({ data: webm(), mimeType: 'audio/webm' }, 'apple')).rejects.toThrow(
        VoiceUnavailableError,
      );
    });
  });
});
