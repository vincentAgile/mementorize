import { generateAiList } from '../../../../../lib/api';

/**
 * MEM-141: a generation of cards by the AI. The browser never calls the API:
 * this route forwards { level, theme, count, kind } with the session's token
 * and passes the API's answer on as it comes — the stream of the cards
 * (server-sent events), or the refusal (400, 409, 429, 502, 503). When the
 * browser gives up (« Annuler »), the call to the API stops too.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return Response.json({ message: 'Settings are expected' }, { status: 400 });
  const { level, theme, count, kind } = body;
  const response = await generateAiList({ level, theme, count, kind }, request.signal);
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      // no-transform: the compression of the server must not hold the stream back.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
