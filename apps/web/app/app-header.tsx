import { logoutAction } from './(auth)/actions';
import { MainNav } from './main-nav';

interface AppHeaderProps {
  email: string;
  dueCount: number;
}

export function AppHeader({ email, dueCount }: AppHeaderProps) {
  return (
    <header className="page__header">
      <div className="page__brand">
        <h1>Mementorize</h1>
        <MainNav dueCount={dueCount} />
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
