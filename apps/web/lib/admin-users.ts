import type { AdminUserRow } from './admin-api';
import { formatDelay } from './format';
import { collator, normalize } from './item-list';

/**
 * MEM-84: the list of the users of the console, as plain functions: its
 * search, its sorts, how its dates read. The table only wires them to its
 * state.
 */

export type UserSortKey = 'user' | 'createdAt' | 'lastActiveAt' | 'Vocabulary' | 'Quote' | 'MindMap' | 'total';

export interface UserSort {
  key: UserSortKey;
  direction: 'asc' | 'desc';
}

/** By default, the most recent activity first. */
export const DEFAULT_USER_SORT: UserSort = { key: 'lastActiveAt', direction: 'desc' };

/** First and last name, when given. */
export const fullName = (user: AdminUserRow) => [user.firstName, user.lastName].filter(Boolean).join(' ');

/** The search looks in the e-mail and the name, ignoring case and accents. */
export function searchUsers(users: AdminUserRow[], search: string): AdminUserRow[] {
  const needle = normalize(search.trim());
  if (!needle) return users;
  return users.filter((user) => normalize(`${user.email} ${fullName(user)}`).includes(needle));
}

const time = (date: string | null) => (date ? new Date(date).getTime() : null);

const VALUE: Record<UserSortKey, (user: AdminUserRow) => number | string | null> = {
  user: (user) => user.email,
  createdAt: (user) => time(user.createdAt),
  lastActiveAt: (user) => time(user.lastActiveAt),
  Vocabulary: (user) => user.counts.Vocabulary.total,
  Quote: (user) => user.counts.Quote.total,
  MindMap: (user) => user.counts.MindMap.total,
  total: (user) => user.counts.total,
};

/** A sorted copy; the users never active stay last in both directions; ties by e-mail. */
export function sortUsers(users: AdminUserRow[], sort: UserSort): AdminUserRow[] {
  const value = VALUE[sort.key];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...users].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
    } else {
      const order = typeof x === 'string' ? collator.compare(x, y as string) : x - (y as number);
      if (order !== 0) return sign * order;
    }
    return collator.compare(a.email, b.email);
  });
}

/** Clicking a header: the figures and dates largest first, the e-mails in alphabetical order; then the other way. */
export function nextUserSort(current: UserSort, key: UserSortKey): UserSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: key === 'user' ? 'asc' : 'desc' };
}

const PARIS = { timeZone: 'Europe/Paris' } as const;

/** « 12/09/2026 ». */
export const shortDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', PARIS);

/** « il y a 3 j », « jamais ». */
export function lastActivity(date: string | null, now: Date): string {
  if (!date) return 'jamais';
  const at = new Date(date);
  if (now.getTime() - at.getTime() < 60 * 60 * 1000) return 'dans l’heure'; // recorded to the hour (MEM-83)
  return `il y a ${formatDelay(at, now)}`;
}

/** « 25/10/2026 à 18:00 », for the title of the cell. */
export const fullDate = (date: string) =>
  new Date(date).toLocaleString('fr-FR', { ...PARIS, dateStyle: 'short', timeStyle: 'short' }).replace(' ', ' à ');
