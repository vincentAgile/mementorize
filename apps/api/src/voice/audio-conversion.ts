import { spawn } from 'node:child_process';
import { InvalidRecordingError, VoiceUnavailableError } from './pronunciation-assessor.js';

/** What the speech services expect: WAV, PCM 16 bits, 16 kHz, mono (32 000 bytes per second). */
const BYTES_PER_SECOND = 16_000 * 2;
const WAV_HEADER = 44;

export const MAX_SECONDS = 10;
const MIN_SECONDS = 0.3;
const TIMEOUT_MS = 5_000;

/**
 * Converts a browser recording (WebM/Opus, MP4/AAC, OGG…) to WAV 16 kHz
 * mono, with ffmpeg, in memory: through pipes, never on disk (MEM-90: the
 * recording is never kept). Longer than 10 s, shorter than 0.3 s, or
 * unreadable: InvalidRecordingError. ffmpeg missing or stuck:
 * VoiceUnavailableError.
 */
export function toWav(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // -t: a little past the limit, to tell « too long » apart.
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        'pipe:0',
        '-t',
        String(MAX_SECONDS + 1),
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        '-map_metadata',
        '-1',
        '-bitexact', // a plain 44-byte header, without metadata
        '-f',
        'wav',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    let settled = false;
    const done = (error: Error | null, wav?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(wav!);
    };
    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      done(new VoiceUnavailableError('ffmpeg took too long'));
    }, TIMEOUT_MS);

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.resume(); // its messages are not kept: they could describe the content
    ffmpeg.on('error', (error) => done(new VoiceUnavailableError(`ffmpeg unavailable: ${error.message}`)));
    ffmpeg.on('close', (code) => {
      if (code !== 0) return done(new InvalidRecordingError('unreadable'));
      const wav = Buffer.concat(chunks);
      const seconds = (wav.length - WAV_HEADER) / BYTES_PER_SECOND;
      if (seconds > MAX_SECONDS + 0.05) return done(new InvalidRecordingError('too-long'));
      if (seconds < MIN_SECONDS) return done(new InvalidRecordingError('too-short'));
      done(null, wav);
    });
    ffmpeg.stdin.on('error', () => undefined); // ffmpeg may stop reading early (bad input)
    ffmpeg.stdin.end(input);
  });
}
