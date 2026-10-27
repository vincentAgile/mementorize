import { assessPronunciation } from '../../../lib/api';

/** As the API: 1 MB at most (10 seconds of browser audio take far less). */
const MAX_BYTES = 1024 * 1024;

/**
 * MEM-91: the recording of « Répéter », sent to the API to be assessed. The
 * browser never calls the API: this route forwards it with the session's
 * token, and passes on the API's answer. Nothing is kept here.
 */
export async function POST(request: Request) {
  const itemId = new URL(request.url).searchParams.get('itemId') ?? '';
  const mimeType = request.headers.get('content-type') ?? '';
  if (!mimeType.startsWith('audio/'))
    return Response.json({ message: 'An audio recording is expected' }, { status: 415 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return Response.json({ message: 'Recording larger than 1 MB' }, { status: 413 });
  }
  const audio = await request.arrayBuffer();
  if (audio.byteLength > MAX_BYTES) return Response.json({ message: 'Recording larger than 1 MB' }, { status: 413 });
  const { status, body } = await assessPronunciation(itemId, audio, mimeType);
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
