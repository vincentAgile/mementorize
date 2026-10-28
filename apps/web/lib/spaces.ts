import { ITEM_NOUN, type Noun, QUOTE_NOUN } from './nouns';
import type { ItemType } from './types';

/**
 * The subject spaces of the app (MEM-2): each one gathers a single type of
 * item, at its own address. Settings (/reglages) is not a space: it shows no
 * items.
 */
export interface Space {
  type: ItemType;
  label: string;
  /** In the bar at the bottom of a phone's screen (MEM-30). */
  shortLabel: string;
  href: string;
  /** Shown when the space has no item yet: invites to add one. */
  emptyText: string;
  /** The button that reviews this subject only (MEM-4). */
  reviewLabel: string;
  /** The sub-menu of the space (MEM-24, MEM-29), if it has one. */
  tabs?: SpaceTab[];
  /** The learning process of the space (MEM-21, MEM-68), if it has one. */
  learnHref?: string;
  /** MEM-94: the page where a learning session is prepared, before it starts. */
  prepareHref?: string;
  /** How its items are named in the messages (v0.12): « élément », « citation ». */
  noun: Noun;
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
    shortLabel: 'Anglais',
    href: '/anglais',
    emptyText:
      'Aucun élément de vocabulaire pour le moment : commence par ajouter un mot, une expression ou une phrase.',
    reviewLabel: "Réviser l'anglais",
    tabs: [
      { href: '/anglais', label: 'Apprendre · Réviser' },
      { href: '/anglais/liste', label: 'Liste' },
      { href: '/anglais/ajouter', label: 'Ajouter' },
      { href: '/anglais/import-export', label: 'Import / export' }, // MEM-52
    ],
    learnHref: '/apprendre',
    prepareHref: '/anglais/preparer', // MEM-94
    noun: ITEM_NOUN,
  },
  {
    type: 'MindMap',
    label: 'Cartes mentales',
    shortLabel: 'Cartes',
    href: '/cartes-mentales',
    emptyText: 'Aucune carte mentale pour le moment : commence par en créer une, autour d’un sujet central.',
    reviewLabel: 'Réviser les cartes mentales',
    // MEM-97: the same sub-menu as the other spaces, without learning nor import.
    tabs: [
      { href: '/cartes-mentales', label: 'Réviser' },
      { href: '/cartes-mentales/liste', label: 'Liste' },
      { href: '/cartes-mentales/ajouter', label: 'Ajouter' },
    ],
    noun: { one: 'carte mentale', many: 'cartes mentales', feminine: true },
  },
  {
    type: 'Quote',
    label: 'Citations',
    shortLabel: 'Citations',
    href: '/citations',
    emptyText: 'Aucune citation pour le moment : commence par ajouter une citation, avec son auteur et sa source.',
    reviewLabel: 'Réviser les citations',
    // MEM-66: the same sub-menu as the Anglais space.
    tabs: [
      { href: '/citations', label: 'Apprendre · Réviser' },
      { href: '/citations/liste', label: 'Liste' },
      { href: '/citations/ajouter', label: 'Ajouter' },
      { href: '/citations/import-export', label: 'Import / export' },
    ],
    learnHref: '/apprendre?type=Quote', // MEM-68
    prepareHref: '/citations/preparer', // MEM-94
    noun: QUOTE_NOUN,
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
 * The space a page belongs to, from its URL (and the `?type=` of the review
 * and of the learning process): its own pages, the review of this subject
 * only (MEM-4), the mind map editor, the learning process of the vocabulary
 * (MEM-21) or of the quotes (/apprendre?type=Quote, MEM-68). None for the
 * pages outside the spaces (Tout réviser, Réglages, Profil).
 */
export function activeSpace(pathname: string, type: string | null): Space | undefined {
  return SPACES.find(
    (space) =>
      startsWith(pathname, space.href) ||
      inSession(space, pathname, type) ||
      (space.type === 'MindMap' && startsWith(pathname, '/mind-maps')),
  );
}

/** The type of the items of a learning session: the vocabulary, unless `?type=` says otherwise. */
export const learnedType = (type: string | null) => type ?? 'Vocabulary';

/** Whether the page is a learning or review session of this space. */
export function inSession(space: Space, pathname: string, type: string | null): boolean {
  return (
    (pathname === '/review' && type === space.type) ||
    // MEM-94: the preparation of a learning session; MEM-95: its selection page.
    (space.prepareHref !== undefined && startsWith(pathname, space.prepareHref)) ||
    (pathname === '/apprendre' && space.learnHref !== undefined && learnedType(type) === space.type)
  );
}

/**
 * The tab shown as the one of the page, when it is not a tab itself: the
 * first one (« Apprendre · Réviser », « Réviser ») during a session or its
 * preparation; « Liste » in the mind map editor (MEM-97).
 */
export function highlightedTab(space: Space, pathname: string, type: string | null): string | undefined {
  if (inSession(space, pathname, type)) return space.tabs?.[0]?.href;
  if (space.type === 'MindMap' && startsWith(pathname, '/mind-maps')) return '/cartes-mentales/liste';
  return undefined;
}

/** Address of the review of one subject (MEM-4). */
export function reviewHref(space: Space): string {
  return `/review?type=${space.type}`;
}
