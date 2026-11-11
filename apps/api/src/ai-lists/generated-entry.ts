/**
 * MEM-139: an entry written by the model, checked before it is proposed:
 * plain text (no tags, no markdown), bounded lengths; an empty, too long or
 * malformed entry is dropped, never shortened.
 */

/** The ten themes offered by the screen (MEM-140); a predefined theme is the topic of its cards. */
export const PREDEFINED_THEMES = [
  'Vie quotidienne',
  'Voyage et transports',
  'Travail et réunions',
  'Restaurant et cuisine',
  'Santé et bien-être',
  'Sport et loisirs',
  'Technologie et internet',
  'Maison et famille',
  'Shopping et argent',
  'Culture et médias',
] as const;

export interface GeneratedEntry {
  english: string;
  french: string;
  example?: string;
  frenchExample?: string;
  /** The label of the theme: the predefined theme, or a short label proposed by the AI. */
  topic: string;
}

const LIMITS = { english: 200, french: 200, example: 500, frenchExample: 500, topic: 50 } as const;

/** Plain text: tags, markdown and quotes around removed, spaces collapsed. */
export function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](link)
    .replace(/[*_`~]+/g, '')
    .replace(/^\s*(?:#+|[-•]\s)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'«“]\s*(.*?)\s*["'»”]$/u, '$1');
}

/** The topic of the cards: the predefined theme as it is, or the AI's short label (else the theme). */
export function topicOf(theme: string, proposed: unknown): string {
  const predefined = PREDEFINED_THEMES.find((label) => label.toLocaleLowerCase('fr') === theme.toLocaleLowerCase('fr'));
  if (predefined) return predefined;
  const label = plainText(proposed);
  return label && label.length <= LIMITS.topic ? label : theme.slice(0, LIMITS.topic).trim();
}

export function sanitizeEntry(raw: unknown, theme: string): GeneratedEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const english = plainText(value.english);
  const french = plainText(value.french);
  if (!english || !french || english.length > LIMITS.english || french.length > LIMITS.french) return null;
  const example = plainText(value.example);
  const frenchExample = plainText(value.frenchExample);
  if (example.length > LIMITS.example || frenchExample.length > LIMITS.frenchExample) return null;
  return {
    english,
    french,
    ...(example && { example }),
    ...(frenchExample && { frenchExample }),
    topic: topicOf(theme, value.topic),
  };
}
