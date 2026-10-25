import { redirect } from 'next/navigation';
import { endSession } from '../../../lib/api';
import { deleteSession, getRefreshToken } from '../../../lib/session';

// A Server Component can't modify cookies while rendering, so when the API
// rejects the token, lib/api.ts redirects here: this Route Handler is allowed
// to delete the stale cookies (MEM-85: both) before sending the user to the
// login page.
export async function GET() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) await endSession(refreshToken);
  await deleteSession();
  redirect('/login?expired=1');
}
