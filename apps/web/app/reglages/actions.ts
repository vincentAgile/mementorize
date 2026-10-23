'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, savePreferences, saveReminderSettings, sendTestReminder } from '../../lib/api';
import { TRANSLATOR_NAMES } from '../../lib/translate-url';
import type { Translator } from '../../lib/types';
import { findSpace } from '../../lib/spaces';

export interface SettingsFormState {
  message?: string;
  error?: string;
}

export async function saveRemindersAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const enabled = formData.get('enabled') === 'on';
  const hour = Number(formData.get('hour'));
  const timeZone = String(formData.get('timeZone') ?? '');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !timeZone) {
    return { error: 'Réglages invalides.' };
  }

  try {
    await saveReminderSettings({ enabled, hour, timeZone });
  } catch (error) {
    if (error instanceof ApiError) return { error: "Impossible d'enregistrer les réglages." };
    throw error; // e.g. the redirect of an expired session
  }
  revalidatePath('/reglages');
  return { message: enabled ? `Rappel enregistré : chaque jour vers ${hour} h.` : 'Rappels désactivés.' };
}

export async function sendTestAction(): Promise<SettingsFormState> {
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

export async function saveHomeSpaceAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const space = findSpace(String(formData.get('homeSpace') ?? ''));
  if (!space) return { error: 'Page d’accueil invalide.' };

  try {
    await savePreferences({ homeSpace: space.type });
  } catch (error) {
    if (error instanceof ApiError) return { error: "Impossible d'enregistrer la page d'accueil." };
    throw error;
  }
  revalidatePath('/reglages');
  return { message: `Page d’accueil enregistrée : ${space.label}.` };
}

const TRANSLATORS: Translator[] = ['DeepL', 'Google'];

/** The service of the translate buttons of the vocabulary forms (MEM-44). */
export async function saveTranslatorAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const translator = String(formData.get('translator') ?? '') as Translator;
  if (!TRANSLATORS.includes(translator)) return { error: 'Service de traduction invalide.' };

  try {
    await savePreferences({ translator });
  } catch (error) {
    if (error instanceof ApiError) return { error: "Impossible d'enregistrer le service de traduction." };
    throw error;
  }
  revalidatePath('/', 'layout'); // the forms of the Anglais space use it
  return { message: `Service de traduction enregistré : ${TRANSLATOR_NAMES[translator]}.` };
}
