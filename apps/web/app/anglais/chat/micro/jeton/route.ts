import { chatVoiceToken } from '../../../../../lib/api';

/**
 * MEM-133: a token for the microphone of the « Chat IA » (10 minutes at
 * most). The browser then streams the voice straight to Azure with it: the
 * key stays on the server, the audio never comes here. Never cached.
 */
export async function POST() {
  const response = await chatVoiceToken();
  if (!response.ok)
    return new Response(null, { status: response.status || 503, headers: { 'Cache-Control': 'no-store' } });
  const { token, region, expiresAt } = (await response.json()) as { token: string; region: string; expiresAt: string };
  return Response.json({ token, region, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
