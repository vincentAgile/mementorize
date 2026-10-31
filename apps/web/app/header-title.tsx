'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { inSettings } from '../lib/settings';
import { activeSpace } from '../lib/spaces';

/** The pages outside the spaces, by address. */
const PAGE_NAMES: Record<string, string> = {
  '/review': 'Tout réviser',
  '/profil': 'Profil',
  '/ressources': 'Ressources',
};

/**
 * On a phone (MEM-34), next to the logo: the name of the active space
 * (Anglais, Cartes mentales, Citations), or of the page outside the spaces
 * (Tout réviser, Réglages, Profil, Ressources). Plain text, the page's h1 on a phone:
 * it takes over from the hidden h1 of MEM-28 (`.page__sr-title`), which a
 * phone doesn't show. Hidden on a computer, where the menu says where we are.
 * The mind map editor has its own visible h1 (the title of the map): there
 * the name is a paragraph.
 */
export function HeaderTitle() {
  const pathname = usePathname();
  const type = useSearchParams().get('type');
  // MEM-78: « Réglages » on each of their tabs.
  const name = activeSpace(pathname, type)?.label ?? (inSettings(pathname) ? 'Réglages' : PAGE_NAMES[pathname]);
  if (!name) return null;

  const Tag = pathname.startsWith('/mind-maps/') ? 'p' : 'h1';
  return <Tag className="app-header__title">{name}</Tag>;
}
