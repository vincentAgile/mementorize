import { normalize } from './item-list';
import type { Item } from './types';

/**
 * The preparation page of a learning session (MEM-94): the items that can
 * be learned, those of the learning queue and those "En attente".
 */

/** Items in a session prepared by the user: ten at most; the first five of the queue to begin with. */
export const MAX_SESSION_SIZE = 10;
export const INITIAL_SESSION_SIZE = 5;

/** The search shows this many items at most: beyond, the user narrows it. */
export const MAX_RESULTS = 8;

export interface Candidate {
  id: string;
  /** The English, or the text of the quote. */
  primary: string;
  /** The French, or the author of the quote. */
  secondary: string | null;
  status: 'ToLearn' | 'Waiting';
  /** What the search looks at, lower case and without accents. */
  search: string;
}

const time = (item: Item) => new Date(item.createdAt).getTime();

/**
 * The items of the queue in its order (MEM-61: by position, those without
 * one last, then the oldest first), then those "En attente", the oldest first.
 */
export function candidatesOf(items: Item[]): Candidate[] {
  const queue = items
    .filter((item) => item.learningStatus === 'ToLearn')
    .sort(
      (a, b) =>
        (a.learnPosition ?? Infinity) - (b.learnPosition ?? Infinity) || time(a) - time(b) || a.id.localeCompare(b.id),
    );
  const waiting = items
    .filter((item) => item.learningStatus === 'Waiting')
    .sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id));
  return [...queue, ...waiting].flatMap((item): Candidate[] => {
    const status = item.learningStatus as Candidate['status'];
    if (item.type === 'Vocabulary') {
      const { word, translation } = item.content;
      return [
        { id: item.id, primary: word, secondary: translation, status, search: normalize(`${word} ${translation}`) },
      ];
    }
    if (item.type === 'Quote') {
      const { text, author } = item.content;
      return [
        { id: item.id, primary: text, secondary: author ?? null, status, search: normalize(`${text} ${author ?? ''}`) },
      ];
    }
    return [];
  });
}

/** The items matching the search (English or French; text or author), not already in the session. */
export function searchCandidates(candidates: Candidate[], query: string, chosen: ReadonlySet<string>): Candidate[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return candidates.filter(
    (candidate) => !chosen.has(candidate.id) && words.every((w) => candidate.search.includes(w)),
  );
}

/** The first item of the queue not already in the session (« Ajouter le suivant de la file »). */
export function nextOfQueue(candidates: Candidate[], chosen: ReadonlySet<string>): Candidate | undefined {
  return candidates.find((candidate) => candidate.status === 'ToLearn' && !chosen.has(candidate.id));
}

/**
 * MEM-95: the composition of the session being prepared, kept in the
 * address (?liste=a,b,c) while going to the selection page and back. The
 * candidates among `ids`, in this order, ten at most; none when the address
 * has no list (a new preparation: the first five of the queue).
 */
export function listOf(param: string | undefined, candidates: Candidate[]): Candidate[] | undefined {
  if (param === undefined) return undefined;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ids = [...new Set(param.split(','))];
  return ids.flatMap((id) => byId.get(id) ?? []).slice(0, MAX_SESSION_SIZE);
}

/** The address of a page of the preparation, with the composition of the session. */
export const withList = (href: string, ids: string[]) => `${href}?liste=${ids.map(encodeURIComponent).join(',')}`;
