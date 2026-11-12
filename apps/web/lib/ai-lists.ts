import { LEVELS } from './catalog';
import type { LanguageLevel } from './types';

/**
 * MEM-140/141: « Générer avec l'IA », in the « Ajouter une liste » tab: the
 * settings of a generation (level, theme, number, kind), remembered in the
 * browser, then the cards proposed (MEM-139), corrected and added to « Ma
 * liste ».
 */

export const AI_LIST_HREF = '/anglais/ajouter-liste/ia';
/** The route that passes a generation on to the API (the browser never calls it). */
export const AI_GENERATE_HREF = '/anglais/ajouter-liste/ia/generer';

export interface AiListStatus {
  enabled: boolean;
  remaining: number;
}

/** The ten themes of the API (PREDEFINED_THEMES, MEM-139), in this order. */
export const THEMES = [
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

export const COUNTS = [5, 10, 15, 20] as const;
export type Count = (typeof COUNTS)[number];

export const KINDS = [
  { value: 'Words', label: 'Mots' },
  { value: 'Expressions', label: 'Expressions' },
  { value: 'Both', label: 'Les deux' },
] as const;
export type Kind = (typeof KINDS)[number]['value'];

/** The free theme: 80 characters at most (the API's limit), a counter from 60. */
export const THEME_MAX = 80;
export const THEME_COUNTER_FROM = 60;
/** The topic of the cards added: the label of the theme, cut (as a word added by hand). */
export const TOPIC_MAX = 50;

export interface AiListSettings {
  level: LanguageLevel;
  /** A predefined theme, or null: « Autre thème… », the free theme. */
  theme: (typeof THEMES)[number] | null;
  /** The free theme as typed, kept when a predefined theme is chosen again. */
  customTheme: string;
  count: Count;
  kind: Kind;
}

export const DEFAULT_SETTINGS: AiListSettings = {
  level: 'B1',
  theme: 'Vie quotidienne',
  customTheme: '',
  count: 10,
  kind: 'Both',
};

export const SETTINGS_KEY = 'mementorize.ai-list.settings';

/** The last settings of this browser, each one checked; the default for what is missing or wrong. */
export function readSettings(storage: Pick<Storage, 'getItem'> | null): AiListSettings {
  let saved: Record<string, unknown> = {};
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    // private window, blocked storage, broken value: the defaults
  }
  return {
    level: LEVELS.some((l) => l.value === saved.level) ? (saved.level as LanguageLevel) : DEFAULT_SETTINGS.level,
    theme:
      saved.theme === null
        ? null
        : THEMES.includes(saved.theme as (typeof THEMES)[number])
          ? (saved.theme as (typeof THEMES)[number])
          : DEFAULT_SETTINGS.theme,
    customTheme: typeof saved.customTheme === 'string' ? saved.customTheme.slice(0, THEME_MAX) : '',
    count: COUNTS.includes(saved.count as Count) ? (saved.count as Count) : DEFAULT_SETTINGS.count,
    kind: KINDS.some((k) => k.value === saved.kind) ? (saved.kind as Kind) : DEFAULT_SETTINGS.kind,
  };
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, settings: AiListSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // not kept: the defaults next time
  }
}

/** The theme sent to the AI: the predefined one, or the free one trimmed (empty: none yet). */
export const themeOf = (settings: AiListSettings) => settings.theme ?? settings.customTheme.trim();

/** « B1 · Voyage et transports · 10 cartes ». */
export const settingsSummary = (settings: AiListSettings) =>
  `${settings.level} · ${themeOf(settings)} · ${settings.count} cartes`;

/** « 7 générations restantes aujourd’hui », « 1 génération restante aujourd’hui ». */
export const remainingText = (remaining: number) =>
  remaining > 1 ? `${remaining} générations restantes aujourd’hui` : `${remaining} génération restante aujourd’hui`;

export const UNAVAILABLE = 'L’IA n’est pas disponible pour le moment.';
export const DAILY_LIMIT = 'Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.';
export const THEME_REQUIRED = 'Saisis un thème.';
export const PRIVACY =
  'L’IA peut se tromper : relis les cartes avant de les ajouter. Ton thème est envoyé à notre prestataire d’IA.';

/** A card proposed by the AI (an `entry` event of the API). */
export interface GeneratedEntry {
  english: string;
  french: string;
  example?: string;
  frenchExample?: string;
  topic: string;
}

/** A row of the preview, as sent to POST /ai-lists/add. */
export interface AiListRow {
  english: string;
  french: string;
  example?: string;
  frenchExample?: string;
}

/** The fields of a row the user can correct, with the limits of a word added by hand. */
export type RowField = 'english' | 'french' | 'example' | 'frenchExample';
export const ROW_MAX: Record<RowField, number> = { english: 200, french: 200, example: 500, frenchExample: 500 };

/** The error of a field corrected, as the « Ajouter une carte » tab says it; null when it is fine. */
export function fieldError(field: RowField, value: string): string | null {
  const text = value.trim();
  if (field === 'english' && !text) return 'Saisis le mot, l’expression ou la phrase en anglais.';
  if (field === 'french' && !text) return 'Saisis la traduction en français.';
  if (text.length > ROW_MAX[field]) return `${ROW_MAX[field]} caractères au plus.`;
  return null;
}

/** The English compared as the API does (MEM-50): its case and the spaces at both ends aside. */
export const duplicateKey = (text: string) => text.trim().toLocaleLowerCase('fr');

/** The events of a generation, as the API sends them (server-sent events). */
export type GenerationEvent =
  | { event: 'entry'; data: GeneratedEntry }
  | { event: 'done'; data: { proposed: number; skippedDuplicates: number } }
  | { event: 'error'; data: { statusCode: number; message: string } };

/** MEM-142: « Proposer d'autres » without a row unchecked. */
export const REPLACE_HINT = 'Décoche les cartes à remplacer.';
export const NOT_ENOUGH = 'Pas assez de nouvelles propositions. Modifie les réglages pour en obtenir d’autres.';
/** The English already proposed sent to the API, at most (the most recent). */
export const EXCLUDE_MAX = 60;

/** « 3 cartes remplacées », « 1 carte remplacée ». */
export const replacedText = (count: number) =>
  count > 1 ? `${count} cartes remplacées.` : `${count} carte remplacée.`;

/** The English proposed in this preview, oldest first, without repeats (the last time counts): the 60 most recent. */
export function excludeOf(proposed: string[]): string[] {
  const latest = new Map<string, string>();
  for (const english of proposed) {
    const key = duplicateKey(english);
    if (!key) continue;
    latest.delete(key);
    latest.set(key, english.trim());
  }
  return [...latest.values()].slice(-EXCLUDE_MAX);
}

/** What a refusal of the API, before the stream, means for the user. */
export function refusalText(status: number, body: { reason?: unknown } | null): string {
  if (status === 429 && body?.reason === 'daily-limit') return DAILY_LIMIT;
  if (status === 409) return 'Une génération est déjà en cours : réessaie dans un instant.';
  if (status === 503) return 'L’IA est occupée pour le moment : réessaie dans un instant.';
  return 'L’IA n’a pas répondu : réessaie.';
}

/** « 7 cartes proposées : 3 étaient déjà dans ta liste. » when fewer cards came than asked. */
export function fewerText(proposed: number, skipped: number): string {
  const cards = `${proposed} carte${proposed > 1 ? 's' : ''} ${proposed > 1 ? 'proposées' : 'proposée'}`;
  if (skipped === 0) return `${cards}.`;
  return `${cards} : ${skipped} ${skipped > 1 ? 'étaient' : 'était'} déjà dans ta liste.`;
}
