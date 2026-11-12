/**
 * MEM-143: « Générer avec l'IA » in the console: its parameters (Console ›
 * Paramètres) and what it costs (Console › Consommation IA).
 */

export const GENERATIONS_MIN = 1;
export const GENERATIONS_MAX = 200;

/** Active, off in the console, or without an AI model on the server. */
export type AiListState = 'active' | 'off' | 'unconfigured';

export interface AdminAiListSettings {
  enabled: boolean;
  generationsPerDay: number;
  state: AiListState;
}

export interface AiListUsageDay {
  /** YYYY-MM-DD, Europe/Paris. */
  day: string;
  generations: number;
  activeUsers: number;
  proposed: number;
  added: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiListTopUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  generations: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiListUsageReport {
  /** The last 30 days, the most recent first. */
  days: AiListUsageDay[];
  /** YYYY-MM. */
  month: string;
  top: AiListTopUser[];
}

export const STATE_LABELS: Record<AiListState, string> = {
  active: 'Active',
  off: 'Coupée par l’administrateur',
  unconfigured: 'Non configurée',
};

export const STATE_HINTS: Record<AiListState, string> = {
  active: 'Les utilisateurs peuvent générer des cartes.',
  off: 'Le choix « Générer avec l’IA » est grisé pour tous les utilisateurs.',
  unconfigured:
    'Aucun modèle d’IA n’est configuré sur le serveur : la génération reste indisponible, quel que soit ce réglage.',
};

/** The error of a whole number of the console between `min` and `max`, or null (MEM-135/143). */
export function boundedError(raw: string, min: number, max: number, empty: string): string | null {
  const text = raw.trim();
  if (!text) return empty;
  if (!/^\d+$/.test(text)) return 'Saisis un nombre entier.';
  const value = Number(text);
  if (value < min || value > max) return `Saisis un nombre entre ${min} et ${max}.`;
  return null;
}

/** The error of the field « Générations par utilisateur et par jour », or null. */
export const generationsError = (raw: string) =>
  boundedError(raw, GENERATIONS_MIN, GENERATIONS_MAX, 'Saisis un nombre de générations.');

const NUMBER = new Intl.NumberFormat('fr-FR');
export const formatCount = (value: number) => NUMBER.format(value);

/** « jeu. 12 nov. ». */
export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** « novembre 2026 ». */
export function formatMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

/** The page of the users of the console, searched on this e-mail: the user's « fiche ». */
export const userHref = (email: string) => `/admin?recherche=${encodeURIComponent(email)}`;
