'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeSpace, inSession } from '../lib/spaces';

/**
 * The second band of the header (MEM-29): the sub-menu of the active space,
 * as tabs (in the Anglais space: Apprendre · Réviser, Liste, Ajouter, MEM-24).
 * The tabs are links, each one a page with its own URL: bookmarks and the
 * browser's Back button work. The band is there on every page, empty when
 * the space has no sub-menu or outside the spaces, so that the page keeps
 * its place from one space to the next.
 * A Client Component, to know which tab is open.
 */
export function SubNav() {
  const pathname = usePathname();
  const type = useSearchParams().get('type');
  const space = activeSpace(pathname, type);
  const tabs = space?.tabs;
  // A learning or review session belongs to the first tab ("Apprendre · Réviser").
  const session = space !== undefined && inSession(space, pathname, type);

  return (
    <div className={tabs ? 'app-header__sub' : 'app-header__sub app-header__sub--empty'}>
      <div className="app-header__inner">
        {space && tabs && (
          <nav className="tabs" aria-label={`Espace ${space.label}`}>
            {tabs.map((tab, index) => {
              const open = pathname === tab.href;
              const active = open || (session && index === 0);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={active ? 'tabs__tab is-active' : 'tabs__tab'}
                  aria-current={open ? 'page' : active ? 'true' : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
