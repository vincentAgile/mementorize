import { redirect } from 'next/navigation';
import { getPreferences } from '../lib/api';
import { spaceOf } from '../lib/spaces';
import { mindMapsEnabledOf } from '../lib/types';

// `/` opens the subject space chosen in Settings (MEM-6), Anglais by
// default. Login and the link of the reminder e-mail lead here.
export default async function HomePage() {
  const preferences = await getPreferences();
  const { homeSpace } = preferences;
  // The space Cartes mentales off: Anglais instead.
  redirect(spaceOf(homeSpace === 'MindMap' && !mindMapsEnabledOf(preferences) ? 'Vocabulary' : homeSpace).href);
}
