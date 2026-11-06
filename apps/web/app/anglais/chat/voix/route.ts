import { chatSpeech } from '../../../../lib/api';

/**
 * MEM-132: a sentence of the « Chat IA » read by Kokoro. The browser never
 * calls the API: this route forwards { text } with the session's token and
 * passes the audio on, never kept. On a refusal (503 without Kokoro, 502,
 * 429), the page reads the sentence with the browser's voice.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== 'string') return new Response(null, { status: 400 });
  const response = await chatSpeech({ text: body.text });
  if (!response.ok || !response.body) return new Response(null, { status: response.status || 502 });
  return new Response(response.body, {
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
}
