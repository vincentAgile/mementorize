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
  /** The button that reviews this subject only (MEM-4). */
  reviewLabel: string;
}

// In the order of the menu (MEM-5).
export const SPACES: Space[] = [
  {
    type: 'Vocabulary',
    label: 'Anglais',
    href: '/anglais',
    emptyText: 'Aucun mot pour le moment : ajoute ton premier mot anglais avec le formulaire ci-dessus.',
    reviewLabel: "Réviser l'anglais",
  },
  {
    type: 'MindMap',
    label: 'Cartes mentales',
    href: '/cartes-mentales',
    emptyText: 'Aucune carte mentale pour le moment : donne un sujet central à ta première carte ci-dessus.',
    reviewLabel: 'Réviser les cartes mentales',
  },
  {
    type: 'Quote',
    label: 'Citations',
    href: '/citations',
    emptyText: 'Aucune citation pour le moment : ajoute ta première citation avec le formulaire ci-dessus.',
    reviewLabel: 'Réviser les citations',
  },
];

export function spaceOf(type: ItemType): Space {
  return SPACES.find((space) => space.type === type)!;
}

/** The space named by a `?type=` query parameter, if it names one. */
export function findSpace(type: string | undefined): Space | undefined {
  return SPACES.find((space) => space.type === type);
}

/** Address of the review of one subject (MEM-4). */
export function reviewHref(space: Space): string {
  return `/review?type=${space.type}`;
}
