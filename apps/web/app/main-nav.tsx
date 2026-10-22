'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SPACES } from '../lib/spaces';
import type { DueSummary } from '../lib/types';

interface NavLink {
  href: string;
  label: string;
  /** Whether this section is the one shown at this URL. */
  isActive: (pathname: string, type: string | null) => boolean;
  /** Number of due cards of this section; undefined: no counter. */
  count?: number;
}

const startsWith = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

function navLinks(due: DueSummary): NavLink[] {
  return [
    ...SPACES.map((space) => ({
      href: space.href,
      label: space.label,
      count: due.byType[space.type],
      isActive: (pathname: string, type: string | null) =>
        startsWith(pathname, space.href) ||
        // The review of this subject only (MEM-4), and the mind map editor.
        (pathname === '/review' && type === space.type) ||
        (space.type === 'MindMap' && startsWith(pathname, '/mind-maps')) ||
        // The learning process of the vocabulary (MEM-21).
        (space.type === 'Vocabulary' && startsWith(pathname, '/apprendre')),
    })),
    {
      href: '/review',
      label: 'Tout réviser',
      count: due.total,
      isActive: (pathname, type) => pathname === '/review' && !SPACES.some((space) => space.type === type),
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
 * A Client Component: only the browser knows the current URL, to highlight
 * the section we are in.
 */
export function MainNav({ due }: { due: DueSummary }) {
  const pathname = usePathname();
  const type = useSearchParams().get('type');

  return (
    <nav className="page__nav" aria-label="Navigation principale">
      {navLinks(due).map((link) => {
        const active = link.isActive(pathname, type);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? 'is-active' : undefined}
            aria-current={active ? 'page' : undefined}
          >
            <span className="page__nav-label">{link.label}</span>
            {link.count !== undefined && <DueBadge count={link.count} />}
          </Link>
        );
      })}
    </nav>
  );
}
