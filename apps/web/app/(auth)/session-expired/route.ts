import { redirect } from 'next/navigation';
import { deleteSession } from '../../../lib/session';

// A Server Component can't modify cookies while rendering, so when the API
// rejects the token, lib/api.ts redirects here: this Route Handler is allowed
// to delete the stale cookie before sending the user to the login page.
export async function GET() {
  await deleteSession();
  redirect('/login?expired=1');
}
