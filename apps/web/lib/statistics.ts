import type { SpaceTab } from './spaces';

/**
 * MEM-113: the tabs of « Mes statistiques », opened from the account menu,
 * in the sub-menu of the header as the Settings (MEM-78): one per space
 * with a learning process, each at its own address. No tab for the mind
 * maps: they have no progress to show.
 */
export const STATISTICS_TABS: SpaceTab[] = [
  { href: '/statistiques/anglais', label: 'Anglais' },
  { href: '/statistiques/citations', label: 'Citations' },
];

/** « Mes statistiques », or one of its tabs. */
export const inStatistics = (pathname: string) => pathname === '/statistiques' || pathname.startsWith('/statistiques/');
