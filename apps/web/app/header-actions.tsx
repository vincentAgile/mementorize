'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { initialsOf } from '../lib/initials';

/**
 * The two icons at the top right of the header (MEM-9): Settings, the only
 * way to reach them, and the account's avatar. A Client Component, to
 * highlight the gear on the Settings page.
 */
export function HeaderActions({ email }: { email: string }) {
  const onSettings = usePathname().startsWith('/reglages');

  return (
    <div className="header-actions">
      <Link
        href="/reglages"
        className={`header-actions__icon${onSettings ? ' is-active' : ''}`}
        aria-label="Réglages"
        title="Réglages"
        aria-current={onSettings ? 'page' : undefined}
      >
        <GearIcon />
      </Link>
      {/* The account menu (profile, logout) opens from here with MEM-10. */}
      <button type="button" className="avatar" aria-label={`Mon compte (${email})`} title="Mon compte">
        {initialsOf(email)}
      </button>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M10.3 2.6h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.3 0 1.9l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.8a6 6 0 0 1 0-1.9l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
