import { redirect } from 'next/navigation';
import { getPreferences } from '../lib/api';
import { spaceOf } from '../lib/spaces';

// `/` opens the subject space chosen in Settings (MEM-6), Anglais by
// default. Login and the link of the reminder e-mail lead here.
export default async function HomePage() {
  const { homeSpace } = await getPreferences();
  redirect(spaceOf(homeSpace).href);
}
