import Link from 'next/link';
import { logoutAction } from './(auth)/actions';

interface AppHeaderProps {
  email: string;
  dueCount: number;
}

export function AppHeader({ email, dueCount }: AppHeaderProps) {
  return (
    <header className="page__header">
      <div className="page__brand">
        <h1>Mementorize</h1>
        <nav className="page__nav">
          <Link href="/">Mes fiches</Link>
          <Link href="/review">
            Réviser {dueCount > 0 && <span className="badge">{dueCount}</span>}
          </Link>
        </nav>
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
