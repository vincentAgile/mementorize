import { sendChatMessage } from '../../../../lib/api';

/**
 * MEM-131: a message of the « Chat IA ». The browser never calls the API:
 * this route forwards { conversationId, text } with the session's token and
 * passes the API's answer on as it comes — the stream of the evaluation and
 * of the reply (server-sent events), or the refusal (400, 403, 404, 409,
 * 429, 502, 503). X-Conversation-Id: the conversation, created here for the
 * first message.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    text?: unknown;
    pronunciation?: unknown;
  } | null;
  const conversationId = typeof body?.conversationId === 'string' && body.conversationId ? body.conversationId : null;
  if (typeof body?.text !== 'string') return Response.json({ message: 'A text is expected' }, { status: 400 });

  // MEM-133: the pronunciation of a message said aloud, checked by the API.
  const pronunciation = body.pronunciation && typeof body.pronunciation === 'object' ? body.pronunciation : undefined;
  const { response, conversationId: id } = await sendChatMessage(conversationId, body.text, pronunciation);
  const headers = new Headers({
    'Content-Type': response.headers.get('content-type') ?? 'application/json',
    // no-transform: the compression of the server must not hold the stream back.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  if (id) headers.set('X-Conversation-Id', id);
  return new Response(response.body, { status: response.status, headers });
}
