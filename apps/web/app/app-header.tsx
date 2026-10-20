import { getDueSummary } from '../lib/api';
import { logoutAction } from './(auth)/actions';
import { MainNav } from './main-nav';

/**
 * Common header. An async Server Component: it fetches the menu's counters
 * itself (MEM-5), so the pages only pass the e-mail they already have.
 */
export async function AppHeader({ email }: { email: string }) {
  const due = await getDueSummary();

  return (
    <header className="page__header">
      <div className="page__brand">
        <h1>Mementorize</h1>
        <MainNav due={due} />
      </div>
      <form action={logoutAction} className="page__user">
        <span>{email}</span>
        <button type="submit" className="link-button">
          Se déconnecter
        </button>
      </form>
    </header>
  );
}
