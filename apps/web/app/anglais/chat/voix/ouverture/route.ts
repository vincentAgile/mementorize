import { chatSpeech } from '../../../../../lib/api';

/**
 * MEM-132: the opening question of the « Chat IA » (« What do you want to
 * talk about today? »), read once in advance by Kokoro: the page loads it on
 * arrival, it starts at once. Kept a day in the browser's cache.
 */
export async function GET() {
  const response = await chatSpeech('opening');
  if (!response.ok || !response.body) return new Response(null, { status: response.status || 502 });
  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
