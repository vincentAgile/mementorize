'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { inSettings, SETTINGS_TABS } from '../lib/settings';
import { activeSpace, highlightedTab } from '../lib/spaces';

/**
 * The second band of the header (MEM-29): the sub-menu of the active space,
 * as tabs (in the Anglais space: Apprendre · Réviser, Liste, Ajouter, MEM-24),
 * or of the Settings (Général, Révision, Rappels, Saisie et fichiers, MEM-78).
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
  // MEM-78: the Settings have their tabs too, under the gear.
  const settings = inSettings(pathname);
  const tabs = settings ? SETTINGS_TABS : space?.tabs;
  const label = settings ? 'Réglages' : `Espace ${space?.label}`;
  // A learning or review session belongs to the first tab ("Apprendre · Réviser");
  // the mind map editor to « Liste » (MEM-97).
  const highlighted = space && highlightedTab(space, pathname, type);
  const nav = useRef<HTMLElement>(null);

  // Narrow screens, where the tabs scroll (MEM-24): the active one in view,
  // even the last one ("Import / export", MEM-52).
  useEffect(() => {
    nav.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <div className={tabs ? 'app-header__sub' : 'app-header__sub app-header__sub--empty'}>
      <div className="app-header__inner">
        {tabs && (
          <nav ref={nav} className="tabs" aria-label={label}>
            {tabs.map((tab) => {
              const open = pathname === tab.href;
              const active = open || highlighted === tab.href;
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
