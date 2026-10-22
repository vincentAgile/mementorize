import { getDueSummary, getProfile } from '../lib/api';
import { HeaderActions } from './header-actions';
import { HeaderTitle } from './header-title';
import { Logo } from './logo';
import { MainNav } from './main-nav';
import { SubNav } from './sub-nav';

/**
 * Common header, in two bands across the whole window (MEM-29), on the
 * page's column (960 px, MEM-33):
 * 1. a neutral band: the logo (MEM-32), its two icons (Settings, account,
 *    MEM-9) and the menu of subjects with their counters (MEM-5), on a
 *    single line when the window is wide enough (MEM-33), else on two;
 * 2. a band tinted with the colour of the app: the sub-menu of the active
 *    space (SubNav). The menu entry of that space joins it, like the tab of
 *    a binder.
 * The name of the app is not a heading: each page has its own h1 (MEM-28);
 * on a phone, the name of the space next to the logo is that h1 (MEM-34).
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
          <Logo className="page__brand" />
          <span className="app-header__divider" aria-hidden="true" />
          <HeaderTitle />
          <HeaderActions profile={profile} />
          <MainNav due={due} />
        </div>
      </div>
      <SubNav />
    </header>
  );
}
