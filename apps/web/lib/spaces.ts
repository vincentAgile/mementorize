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
  /** The sub-menu of the space (MEM-24, MEM-29), if it has one. */
  tabs?: SpaceTab[];
}

export interface SpaceTab {
  href: string;
  label: string;
}

// In the order of the menu (MEM-5).
export const SPACES: Space[] = [
  {
    type: 'Vocabulary',
    label: 'Anglais',
    href: '/anglais',
    emptyText: 'Aucun mot pour le moment : ajoute ton premier mot anglais avec le formulaire ci-dessus.',
    reviewLabel: "Réviser l'anglais",
    tabs: [
      { href: '/anglais', label: 'Apprendre · Réviser' },
      { href: '/anglais/liste', label: 'Liste' },
      { href: '/anglais/ajouter', label: 'Ajouter' },
    ],
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

const startsWith = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The space a page belongs to, from its URL (and the `?type=` of the
 * review): its own pages, the review of this subject only (MEM-4), the mind
 * map editor, the learning process of the vocabulary (MEM-21). None for the
 * pages outside the spaces (Tout réviser, Réglages, Profil).
 */
export function activeSpace(pathname: string, type: string | null): Space | undefined {
  return SPACES.find(
    (space) =>
      startsWith(pathname, space.href) ||
      (pathname === '/review' && type === space.type) ||
      (space.type === 'MindMap' && startsWith(pathname, '/mind-maps')) ||
      (space.type === 'Vocabulary' && startsWith(pathname, '/apprendre')),
  );
}

/** Whether the page is a learning or review session of this space. */
export function inSession(space: Space, pathname: string, type: string | null): boolean {
  return (pathname === '/review' && type === space.type) || (space.type === 'Vocabulary' && pathname === '/apprendre');
}

/** Address of the review of one subject (MEM-4). */
export function reviewHref(space: Space): string {
  return `/review?type=${space.type}`;
}
