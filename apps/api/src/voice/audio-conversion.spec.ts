import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { toWav } from './audio-conversion.js';
import { InvalidRecordingError } from './pronunciation-assessor.js';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** A recording as Chrome makes it (WebM/Opus), or as Safari (MP4/AAC). */
const recording = (seconds: number, format: 'webm' | 'mp4' = 'webm') =>
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=duration=${seconds}`,
    ...(format === 'webm'
      ? ['-c:a', 'libopus', '-f', 'webm']
      : ['-c:a', 'aac', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov']),
    'pipe:1',
  ]);

describe.skipIf(!hasFfmpeg)('toWav (MEM-90)', () => {
  it('converts WebM/Opus and MP4/AAC to WAV 16 kHz mono, in memory', async () => {
    for (const format of ['webm', 'mp4'] as const) {
      const wav = await toWav(recording(2, format));
      expect(wav.subarray(0, 4).toString()).toBe('RIFF');
      expect(wav.readUInt32LE(24)).toBe(16_000); // sample rate
      expect(wav.readUInt16LE(22)).toBe(1); // mono
      expect(Math.round((wav.length - 44) / 32_000)).toBe(2);
    }
  });

  it('refuses a recording longer than 10 seconds, too short, or unreadable', async () => {
    await expect(toWav(recording(12))).rejects.toMatchObject({ reason: 'too-long' });
    await expect(toWav(recording(0.1))).rejects.toMatchObject({ reason: 'too-short' });
    await expect(toWav(Buffer.from('not audio at all'))).rejects.toBeInstanceOf(InvalidRecordingError);
    expect((await toWav(recording(9.9))).length).toBeGreaterThan(44 + 9 * 32_000); // just under: accepted
  });
});
