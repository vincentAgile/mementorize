import { getDueSummary } from '../lib/api';
import { HeaderActions } from './header-actions';
import { MainNav } from './main-nav';

/**
 * Common header: the name of the app and its two icons (Settings, account)
 * on a first line (MEM-9), the menu of subjects below. An async Server
 * Component: it fetches the menu's counters itself (MEM-5), so the pages
 * only pass the e-mail they already have.
 */
export async function AppHeader({ email }: { email: string }) {
  const due = await getDueSummary();

  return (
    <header className="page__header">
      <div className="page__topbar">
        <h1>Mementorize</h1>
        <HeaderActions email={email} />
      </div>
      <MainNav due={due} />
    </header>
  );
}
