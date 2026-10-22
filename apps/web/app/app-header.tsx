import { getDueSummary, getProfile } from '../lib/api';
import { HeaderActions } from './header-actions';
import { MainNav } from './main-nav';

/**
 * Common header: the name of the app (not a heading: each page has its own
 * h1, MEM-28) and its two icons (Settings, account)
 * on a first line (MEM-9), the menu of subjects below. An async Server
 * Component: it fetches what it shows itself, the menu's counters (MEM-5)
 * and the profile of the avatar (MEM-11).
 */
export async function AppHeader() {
  const [due, profile] = await Promise.all([getDueSummary(), getProfile()]);

  return (
    <header className="page__header">
      <div className="page__topbar">
        <p className="page__brand">Mementorize</p>
        <HeaderActions profile={profile} />
      </div>
      <MainNav due={due} />
    </header>
  );
}
