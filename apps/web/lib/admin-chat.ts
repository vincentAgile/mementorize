/**
 * MEM-135: the Chat IA in the console: its parameters (Console › Paramètres)
 * and what it costs (Console › Consommation IA).
 */
import { type AiListState, boundedError } from './admin-ai-lists';

export type ChatState = AiListState;

export interface AdminChatSettings {
  enabled: boolean;
  messagesPerDay: number;
  messagesPerConversation: number;
  maxReplyWords: number;
  state: ChatState;
}

export type ChatField = 'messagesPerDay' | 'messagesPerConversation' | 'maxReplyWords';

/** The three numbers of the block « Chat IA », in their order, with their bounds (as the API's). */
export const CHAT_FIELDS: { name: ChatField; label: string; min: number; max: number; empty: string }[] = [
  {
    name: 'messagesPerDay',
    label: 'Messages par utilisateur et par jour',
    min: 1,
    max: 500,
    empty: 'Saisis un nombre de messages.',
  },
  {
    name: 'messagesPerConversation',
    label: 'Messages par conversation',
    min: 2,
    max: 100,
    empty: 'Saisis un nombre de messages.',
  },
  {
    name: 'maxReplyWords',
    label: 'Longueur maximale d’une réponse (mots)',
    min: 30,
    max: 300,
    empty: 'Saisis un nombre de mots.',
  },
];

/** The errors of the fields, by name; empty when all are fine. */
export function chatErrors(values: Record<ChatField, string>): Partial<Record<ChatField, string>> {
  const errors: Partial<Record<ChatField, string>> = {};
  for (const field of CHAT_FIELDS) {
    const error = boundedError(values[field.name], field.min, field.max, field.empty);
    if (error) errors[field.name] = error;
  }
  return errors;
}

export const CHAT_STATE_HINTS: Record<ChatState, string> = {
  active: 'Les utilisateurs autorisés peuvent écrire au Chat IA.',
  off: 'Le Chat IA est masqué pour tous les utilisateurs.',
  unconfigured:
    'Aucun modèle d’IA n’est configuré sur le serveur : le Chat IA reste indisponible, quel que soit ce réglage.',
};

export interface ChatUsageDay {
  /** YYYY-MM-DD, Europe/Paris. */
  day: string;
  conversations: number;
  messages: number;
  activeUsers: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatTopUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  messages: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatUsageReport {
  /** The last 30 days, the most recent first. */
  days: ChatUsageDay[];
  /** YYYY-MM. */
  month: string;
  top: ChatTopUser[];
}
