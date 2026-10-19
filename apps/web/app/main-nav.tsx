'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SPACES } from '../lib/spaces';

interface NavLink {
  href: string;
  label: string;
  /** The URLs that belong to this section. */
  prefixes: string[];
}

const SPACE_LINKS: NavLink[] = SPACES.map((space) => ({
  href: space.href,
  label: space.label,
  // The mind map editor belongs to the "Cartes mentales" space.
  prefixes: space.type === 'MindMap' ? [space.href, '/mind-maps'] : [space.href],
}));
const REVIEW_LINK: NavLink = { href: '/review', label: 'Réviser', prefixes: ['/review'] };
const SETTINGS_LINK: NavLink = { href: '/reglages', label: 'Réglages', prefixes: ['/reglages'] };

function isActive(pathname: string, { prefixes }: NavLink): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The sections of the app (MEM-2): the three subject spaces, the review and
 * Settings. A Client Component: only the browser knows the current URL, to
 * highlight the section we are in.
 */
export function MainNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();

  const linkTo = (link: NavLink, extra?: React.ReactNode) => {
    const active = isActive(pathname, link);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={active ? 'is-active' : undefined}
        aria-current={active ? 'page' : undefined}
      >
        {link.label}
        {extra}
      </Link>
    );
  };

  return (
    <nav className="page__nav" aria-label="Navigation principale">
      {SPACE_LINKS.map((link) => linkTo(link))}
      {/* Kept as is until the "review everything" action of MEM-5 */}
      {linkTo(
        REVIEW_LINK,
        dueCount > 0 && (
          <>
            {' '}
            <span className="badge">{dueCount}</span>
          </>
        ),
      )}
      {linkTo(SETTINGS_LINK)}
    </nav>
  );
}
