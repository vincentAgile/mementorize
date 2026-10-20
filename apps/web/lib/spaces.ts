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
  /** Shown when the space has no item yet: invites to fill the form above. */
  emptyText: string;
}

export const SPACES: Space[] = [
  {
    type: 'Quote',
    label: 'Citations',
    href: '/citations',
    emptyText: 'Aucune citation pour le moment : ajoute ta première citation avec le formulaire ci-dessus.',
  },
  {
    type: 'MindMap',
    label: 'Cartes mentales',
    href: '/cartes-mentales',
    emptyText: 'Aucune carte mentale pour le moment : donne un sujet central à ta première carte ci-dessus.',
  },
  {
    type: 'Vocabulary',
    label: 'Anglais',
    href: '/anglais',
    emptyText: 'Aucun mot pour le moment : ajoute ton premier mot anglais avec le formulaire ci-dessus.',
  },
];

/** Where `/` leads, until the home page can be chosen in Settings (MEM-6). */
export const DEFAULT_SPACE = SPACES[2];

export function spaceOf(type: ItemType): Space {
  return SPACES.find((space) => space.type === type)!;
}
