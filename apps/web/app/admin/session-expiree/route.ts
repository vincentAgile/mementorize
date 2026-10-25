import { redirect } from 'next/navigation';
import { deleteAdminSession } from '../../../lib/admin-session';

// The API refused the administration token (expired after 2 hours, account
// deleted): a Route Handler may delete the cookie, then back to the login.
export async function GET() {
  await deleteAdminSession();
  redirect('/admin/connexion?expiree=1');
}
