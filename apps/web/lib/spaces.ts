import type { ItemType } from './types';

/**
 * The subject spaces of the app (MEM-2): each one gathers a single type of
 * item, at its own address. Settings (/reglages) is not a space: it shows no
 * items.
 */
export interface Space {
  type: ItemType;
  label: string;
  href: string;
}

export const SPACES: Space[] = [
  { type: 'Quote', label: 'Citations', href: '/citations' },
  { type: 'MindMap', label: 'Cartes mentales', href: '/cartes-mentales' },
  { type: 'Vocabulary', label: 'Anglais', href: '/anglais' },
];

/** Where `/` leads, until the home page can be chosen in Settings (MEM-6). */
export const DEFAULT_SPACE = SPACES[2];

export function spaceOf(type: ItemType): Space {
  return SPACES.find((space) => space.type === type)!;
}
