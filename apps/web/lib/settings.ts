import type { SpaceTab } from './spaces';

/**
 * The tabs of the Settings (MEM-78), in the sub-menu of the header as the
 * tabs of a space: each one a page with its own address.
 */
export const SETTINGS_TABS: SpaceTab[] = [
  { href: '/reglages', label: 'Général' },
  { href: '/reglages/rappels', label: 'Rappels' },
  { href: '/reglages/import-export', label: 'Import / export' },
  // Mode d'utilisation, Espace cartes mentales, Rétention cible, Optimisation: for those who know.
  { href: '/reglages/avance', label: 'Avancé' },
];

/** The Settings, or one of their tabs. */
export const inSettings = (pathname: string) => pathname === '/reglages' || pathname.startsWith('/reglages/');
