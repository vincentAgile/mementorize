'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, saveReminderSettings, sendTestReminder } from '../../lib/api';

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
