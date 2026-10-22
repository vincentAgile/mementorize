'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeSpace, SPACES } from '../lib/spaces';
import type { DueSummary } from '../lib/types';

interface NavLink {
  href: string;
  label: string;
  /** Number of due cards of this section. */
  count: number;
  active: boolean;
  /** A subject space: when active, its entry joins the band of its sub-menu (MEM-29). */
  isSpace: boolean;
}

function navLinks(due: DueSummary, pathname: string, type: string | null): NavLink[] {
  const current = activeSpace(pathname, type);
  return [
    ...SPACES.map((space) => ({
      href: space.href,
      label: space.label,
      count: due.byType[space.type],
      active: space === current,
      isSpace: true,
    })),
    {
      href: '/review',
      label: 'Tout réviser',
      count: due.total,
      active: pathname === '/review' && !current,
      isSpace: false,
    },
  ];
}

/** The number of due cards, or a check in a light badge when there is none. */
function DueBadge({ count }: { count: number }) {
  if (count > 0) {
    return (
      <span className="badge" aria-label={`${count} carte${count > 1 ? 's' : ''} à réviser`}>
        {count}
      </span>
    );
  }
  return (
    <span className="badge badge--done" role="img" aria-label="rien à réviser">
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <path
          d="M2.5 6.3l2.4 2.4 4.6-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * The menu (MEM-5): the three subject spaces and "Tout réviser", each with
 * its number of due cards. Settings moved to an icon of the header (MEM-9).
 * The entry of the active space looks like the tab of a binder: it joins
 * the band of the sub-menu below (MEM-29).
 * A Client Component: only the browser knows the current URL, to highlight
 * the section we are in.
 */
export function MainNav({ due }: { due: DueSummary }) {
  const pathname = usePathname();
  const type = useSearchParams().get('type');

  return (
    <nav className="page__nav" aria-label="Navigation principale">
      {navLinks(due, pathname, type).map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={[link.active && 'is-active', link.isSpace && 'page__nav-space'].filter(Boolean).join(' ')}
          aria-current={link.active ? 'page' : undefined}
        >
          <span className="page__nav-label">{link.label}</span>
          <DueBadge count={link.count} />
        </Link>
      ))}
    </nav>
  );
}
