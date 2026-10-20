'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile } from '../lib/types';
import { AccountMenu } from './account-menu';

/**
 * The two icons at the top right of the header (MEM-9): Settings, the only
 * way to reach them, and the account's avatar. A Client Component, to
 * highlight the gear on the Settings page.
 */
export function HeaderActions({ profile }: { profile: Profile }) {
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
      <AccountMenu profile={profile} />
    </div>
  );
}

// A regular eight-tooth gear (MEM-12): teeth computed every 45° on a
// 24 × 24 grid, so that the outline stays round.
const GEAR_OUTLINE =
  'M9.62 5.10 L10.17 2.58 L13.83 2.58 L14.38 5.10 L15.20 5.44 L17.37 4.04 L19.96 6.63 L18.56 8.80 L18.90 9.62 L21.42 10.17 L21.42 13.83 L18.90 14.38 L18.56 15.20 L19.96 17.37 L17.37 19.96 L15.20 18.56 L14.38 18.90 L13.83 21.42 L10.17 21.42 L9.62 18.90 L8.80 18.56 L6.63 19.96 L4.04 17.37 L5.44 15.20 L5.10 14.38 L2.58 13.83 L2.58 10.17 L5.10 9.62 L5.44 8.80 L4.04 6.63 L6.63 4.04 L8.80 5.44 Z';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={GEAR_OUTLINE} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
