import type { ReactNode } from 'react';

/** The band of the console: « Mementorize · Console d'administration », then, once logged in, who and « Déconnexion ». */
export function AdminBanner({ children }: { children?: ReactNode }) {
  return (
    <header className="admin-banner">
      <div className="admin-banner__inner">
        <p className="admin-banner__title">
          <span className="admin-banner__brand">Mementorize</span> · Console d’administration
        </p>
        {children}
      </div>
    </header>
  );
}
