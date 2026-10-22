'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/anglais', label: 'Apprendre · Réviser' },
  { href: '/anglais/liste', label: 'Liste' },
  { href: '/anglais/ajouter', label: 'Ajouter' },
];

/**
 * The tabs of the Anglais space (MEM-24). They are links, each tab being a
 * page with its own URL: bookmarks and the browser's Back button work. A
 * Client Component, to know which one is open.
 */
export function EnglishTabs() {
  const pathname = usePathname();

  return (
    <nav className="tabs" aria-label="Espace Anglais">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? 'tabs__tab is-active' : 'tabs__tab'}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
