import { isApiHealthy } from '../../lib/api';

// Checked every minute by Uptime Kuma (phase 11): the whole chain answers,
// Traefik → web → API → database. Public (see proxy.ts); reveals nothing.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const ok = await isApiHealthy();
  return Response.json({ status: ok ? 'ok' : 'api unavailable' }, { status: ok ? 200 : 503 });
}
