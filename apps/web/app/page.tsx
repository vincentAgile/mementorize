import { redirect } from 'next/navigation';
import { DEFAULT_SPACE } from '../lib/spaces';

// The old home page (all items, filtered by type) is gone (MEM-2): `/` now
// opens a subject space. Login, the review page and bookmarks still lead here.
export default function HomePage() {
  redirect(DEFAULT_SPACE.href);
}
