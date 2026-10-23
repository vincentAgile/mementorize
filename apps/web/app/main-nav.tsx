'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeSpace, SPACES } from '../lib/spaces';
import type { DueSummary, ItemType } from '../lib/types';

interface NavLink {
  href: string;
  label: string;
  /** In the bar at the bottom of a phone's screen (MEM-30). */
  shortLabel: string;
  icon: React.ReactNode;
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
      shortLabel: space.shortLabel,
      icon: SPACE_ICONS[space.type],
      count: due.byType[space.type],
      active: space === current,
      isSpace: true,
    })),
    {
      href: '/review',
      label: 'Tout réviser',
      shortLabel: 'Tout réviser',
      icon: <ReviewAllIcon />,
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
      <span className="badge" aria-label={`${count}\u00a0carte${count > 1 ? 's' : ''} à réviser`}>
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
 * On a phone (< 640 px), the same menu becomes a bar fixed at the bottom of
 * the screen, each entry with an icon, a short label and its counter
 * (MEM-30, globals.css).
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
          <span className="page__nav-icon">{link.icon}</span>
          <span
            className={link.shortLabel === link.label ? 'page__nav-label' : 'page__nav-label page__nav-label--long'}
          >
            {link.label}
          </span>
          {link.shortLabel !== link.label && (
            <span className="page__nav-short" aria-hidden="true">
              {link.shortLabel}
            </span>
          )}
          {/* After the label: screen readers say « Anglais, 2 cartes à réviser ». */}
          <DueBadge count={link.count} />
        </Link>
      ))}
    </nav>
  );
}

// The icons of the bar at the bottom of a phone's screen (MEM-30); hidden on a computer.
const ICON = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** A speech bubble: the language. */
function EnglishIcon() {
  return (
    <svg {...ICON}>
      <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

/** A central idea and its branches. */
function MindMapIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="5" cy="5.5" r="1.8" />
      <circle cx="19" cy="5.5" r="1.8" />
      <circle cx="5" cy="18.5" r="1.8" />
      <circle cx="19" cy="18.5" r="1.8" />
      <path d="M10 10.2 6.3 6.8M14 10.2l3.7-3.4M10 13.8l-3.7 3.4M14 13.8l3.7 3.4" />
    </svg>
  );
}

/** Quotation marks. */
function QuoteIcon() {
  return (
    <svg {...ICON}>
      <path d="M10 7.5H6.5A1.5 1.5 0 0 0 5 9v3h5V9.5M10 12c0 2.5-1.2 4-3.5 4.8" />
      <path d="M19 7.5h-3.5A1.5 1.5 0 0 0 14 9v3h5V9.5M19 12c0 2.5-1.2 4-3.5 4.8" />
    </svg>
  );
}

/** A stack of cards. */
function ReviewAllIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="8" width="13" height="12" rx="1.8" />
      <path d="M7.5 5h11A1.5 1.5 0 0 1 20 6.5v10" />
    </svg>
  );
}

const SPACE_ICONS: Record<ItemType, React.ReactNode> = {
  Vocabulary: <EnglishIcon />,
  MindMap: <MindMapIcon />,
  Quote: <QuoteIcon />,
};
