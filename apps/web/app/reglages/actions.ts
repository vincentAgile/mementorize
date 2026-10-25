'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  getOptimization,
  resetOptimization,
  savePreferences,
  saveReminderSettings,
  sendTestReminder,
  startOptimization,
} from '../../lib/api';
import { separatorProblem } from '../../lib/csv-separator';
import { findSpace } from '../../lib/spaces';
import type { ItemType, Preferences, SpaceOptimization, Translator } from '../../lib/types';
import type { SaveResult } from './save-result';

// MEM-79: each setting is saved as soon as its change is confirmed. A Server
// Action is a public endpoint: the values are checked here, an invalid one
// is not saved.

const FAILED = 'L’enregistrement a échoué.';

/** Saves preferences; `revalidate`: the pages that show them. */
async function save(preferences: Partial<Preferences>, revalidate: 'settings' | 'all'): Promise<SaveResult> {
  try {
    await savePreferences(preferences);
  } catch (error) {
    if (error instanceof ApiError) return { failed: FAILED };
    throw error; // e.g. the redirect of an expired session
  }
  if (revalidate === 'all') revalidatePath('/', 'layout');
  else revalidatePath('/reglages', 'layout'); // every tab of the Settings
  return { ok: true };
}

/** The space opened on arrival (MEM-6). */
export async function saveHomeSpaceAction(homeSpace: ItemType): Promise<SaveResult> {
  if (!findSpace(homeSpace)) return { invalid: 'Page d’accueil invalide.' };
  return save({ homeSpace }, 'settings');
}

const TRANSLATORS: Translator[] = ['DeepL', 'Google'];

/** The service of the translate buttons of the vocabulary forms (MEM-44). */
export async function saveTranslatorAction(translator: Translator): Promise<SaveResult> {
  if (!TRANSLATORS.includes(translator)) return { invalid: 'Service de traduction invalide.' };
  return save({ translator }, 'all'); // the forms of the Anglais space use it
}

/** Show the delays under the rating buttons (MEM-49). */
export async function saveReviewDelaysAction(showReviewDelays: boolean): Promise<SaveResult> {
  if (typeof showReviewDelays !== 'boolean') return { invalid: 'Réglage invalide.' };
  return save({ showReviewDelays }, 'settings');
}

/** The separator of the CSV files, export and import (MEM-55): any single character since MEM-80. */
export async function saveCsvSeparatorAction(csvSeparator: string): Promise<SaveResult> {
  const problem = typeof csvSeparator === 'string' ? separatorProblem(csvSeparator) : 'Séparateur invalide.';
  if (problem) return { invalid: problem };
  return save({ csvSeparator }, 'all'); // the Import / export tabs use it
}

/** The target retentions (MEM-75): 85, 90 or 95 %, for each space. */
const RETENTIONS = [85, 90, 95];
const RETENTION_FIELDS = {
  Vocabulary: 'vocabularyRetention',
  Quote: 'quoteRetention',
  MindMap: 'mindMapRetention',
} as const satisfies Record<ItemType, keyof Preferences>;

/** The target retention of a space (MEM-75): applied from the next review of each card. */
export async function saveRetentionAction(type: ItemType, retention: number): Promise<SaveResult> {
  if (!(type in RETENTION_FIELDS) || !RETENTIONS.includes(retention)) return { invalid: 'Rétention invalide.' };
  return save({ [RETENTION_FIELDS[type]]: retention }, 'settings');
}

/** What an action on the optimization gives (MEM-76): where the space stands now, or why it didn't. */
export type OptimizationResult = { space: SpaceOptimization } | { error: string };

/** Starts the optimization of the FSRS weights of a space (MEM-76), in the background. */
export async function optimizeAction(type: ItemType): Promise<OptimizationResult> {
  if (!(type in RETENTION_FIELDS)) return { error: 'Espace inconnu.' };
  try {
    return { space: await startOptimization(type) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409) {
      return { error: 'L’optimisation n’a pas pu démarrer : pas assez de révisions, ou une autre est en cours.' };
    }
    return { error: 'L’optimisation n’a pas pu démarrer.' };
  }
}

/** Back to the default weights of a space (MEM-76). */
export async function resetOptimizationAction(type: ItemType): Promise<OptimizationResult> {
  if (!(type in RETENTION_FIELDS)) return { error: 'Espace inconnu.' };
  try {
    return { space: await resetOptimization(type) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409) return { error: 'Une optimisation est en cours : attendez qu’elle se termine.' };
    return { error: 'Le retour aux valeurs par défaut a échoué.' };
  }
}

/** Where each space stands (MEM-76): to follow an optimization running in the background. */
export async function optimizationStatusAction(): Promise<SpaceOptimization[] | null> {
  try {
    return await getOptimization();
  } catch (error) {
    if (error instanceof ApiError) return null; // the next poll will tell
    throw error;
  }
}

/** The daily reminder e-mail (phase 11): on or off, its hour, in the browser's time zone. */
export async function saveRemindersAction(settings: {
  enabled: boolean;
  hour: number;
  timeZone: string;
}): Promise<SaveResult> {
  const { enabled, hour, timeZone } = settings ?? {};
  if (typeof enabled !== 'boolean' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { invalid: 'Heure invalide.' };
  }
  if (typeof timeZone !== 'string' || !timeZone) return { invalid: 'Fuseau horaire inconnu.' };
  try {
    await saveReminderSettings({ enabled, hour, timeZone });
  } catch (error) {
    if (error instanceof ApiError) return { failed: FAILED };
    throw error;
  }
  revalidatePath('/reglages', 'layout');
  return { ok: true };
}

export interface TestEmailState {
  message?: string;
  error?: string;
}

/** Sends the reminder e-mail now, to check that it arrives: an action, not a setting. */
export async function sendTestAction(): Promise<TestEmailState> {
  try {
    await sendTestReminder();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const reasons: Record<number, string> = {
      503: "L'envoi d'e-mails n'est pas configuré sur le serveur.",
      429: 'Un e-mail de test vient de partir : réessaie dans une minute.',
      502: "Le serveur d'e-mails a refusé l'envoi.",
    };
    return { error: reasons[error.status] ?? "L'envoi a échoué." };
  }
  return { message: 'E-mail de test envoyé : regarde ta boîte de réception (et les indésirables).' };
}
