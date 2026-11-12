'use server';

import { revalidatePath } from 'next/cache';
import { generationsError } from '../../../../lib/admin-ai-lists';
import { saveAiListSettings } from '../../../../lib/admin-api';

export interface AiListSettingsState {
  values?: { enabled: boolean; generationsPerDay: string };
  fieldError?: string;
  error?: string;
  saved?: boolean;
}

/** MEM-143: the switch and the quota of « Générer avec l'IA »; they apply at once. */
export async function saveAiListSettingsAction(
  _previous: AiListSettingsState,
  formData: FormData,
): Promise<AiListSettingsState> {
  const raw = formData.get('generationsPerDay');
  const values = {
    enabled: formData.get('enabled') === 'on',
    generationsPerDay: typeof raw === 'string' ? raw : '',
  };
  const fieldError = generationsError(values.generationsPerDay);
  if (fieldError) return { values, fieldError };
  const result = await saveAiListSettings({
    enabled: values.enabled,
    generationsPerDay: Number(values.generationsPerDay.trim()),
  });
  if (!result.ok) {
    return {
      values,
      error:
        result.status === null
          ? 'Le serveur ne répond pas. Réessaie dans un instant.'
          : 'Impossible d’enregistrer les réglages.',
    };
  }
  revalidatePath('/admin', 'layout');
  return { saved: true };
}
