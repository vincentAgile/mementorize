import type { SpaceTab } from './spaces';

/**
 * The tabs of the Settings (MEM-78), in the sub-menu of the header as the
 * tabs of a space: each one a page with its own address.
 */
export const SETTINGS_TABS: SpaceTab[] = [
  { href: '/reglages', label: 'Général' },
  { href: '/reglages/revision', label: 'Révision' },
  { href: '/reglages/rappels', label: 'Rappels' },
  { href: '/reglages/saisie', label: 'Saisie et fichiers' },
];

/** The Settings, or one of their tabs. */
export const inSettings = (pathname: string) => pathname === '/reglages' || pathname.startsWith('/reglages/');
