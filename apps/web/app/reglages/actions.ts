'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, savePreferences, saveReminderSettings, sendTestReminder } from '../../lib/api';
import { separatorProblem } from '../../lib/csv-separator';
import { findSpace } from '../../lib/spaces';
import type { ItemType, Preferences, Translator } from '../../lib/types';
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
