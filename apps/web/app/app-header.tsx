import { getDueSummary, getProfile } from '../lib/api';
import { HeaderActions } from './header-actions';
import { MainNav } from './main-nav';

/**
 * Common header: the name of the app and its two icons (Settings, account)
 * on a first line (MEM-9), the menu of subjects below. An async Server
 * Component: it fetches what it shows itself, the menu's counters (MEM-5)
 * and the profile of the avatar (MEM-11).
 */
export async function AppHeader() {
  const [due, profile] = await Promise.all([getDueSummary(), getProfile()]);

  return (
    <header className="page__header">
      <div className="page__topbar">
        <h1>Mementorize</h1>
        <HeaderActions profile={profile} />
      </div>
      <MainNav due={due} />
    </header>
  );
}
