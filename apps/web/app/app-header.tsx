import { getDueSummary, getProfile } from '../lib/api';
import { HeaderActions } from './header-actions';
import { MainNav } from './main-nav';
import { SubNav } from './sub-nav';

/**
 * Common header, in two bands across the whole window (MEM-29):
 * 1. a neutral band: the name of the app, its two icons (Settings, account,
 *    MEM-9) and the menu of subjects with their counters (MEM-5);
 * 2. a band tinted with the colour of the app: the sub-menu of the active
 *    space (SubNav). The menu entry of that space joins it, like the tab of
 *    a binder.
 * The name of the app is not a heading: each page has its own h1 (MEM-28).
 * An async Server Component: it fetches what it shows itself, the menu's
 * counters and the profile of the avatar (MEM-11). It sits before the
 * page's <main>.
 */
export async function AppHeader() {
  const [due, profile] = await Promise.all([getDueSummary(), getProfile()]);

  return (
    <header className="app-header">
      <div className="app-header__bar">
        <div className="app-header__inner app-header__top">
          <p className="page__brand">Mementorize</p>
          <HeaderActions profile={profile} />
          <MainNav due={due} />
        </div>
      </div>
      <SubNav />
    </header>
  );
}
