'use server';

import { revalidatePath } from 'next/cache';
import { generationsError } from '../../../../lib/admin-ai-lists';
import { saveAiListSettings, saveChatSettings } from '../../../../lib/admin-api';
import { CHAT_FIELDS, type ChatField, chatErrors } from '../../../../lib/admin-chat';

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

export interface ChatSettingsState {
  values?: { enabled: boolean } & Record<ChatField, string>;
  fieldErrors?: Partial<Record<ChatField, string>>;
  error?: string;
  saved?: boolean;
}

/** MEM-135: the switch and the limits of the Chat IA; they apply at once. */
export async function saveChatSettingsAction(
  _previous: ChatSettingsState,
  formData: FormData,
): Promise<ChatSettingsState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const values = {
    enabled: formData.get('enabled') === 'on',
    ...(Object.fromEntries(CHAT_FIELDS.map((field) => [field.name, text(field.name)])) as Record<ChatField, string>),
  };
  const fieldErrors = chatErrors(values);
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  const result = await saveChatSettings({
    enabled: values.enabled,
    messagesPerDay: Number(values.messagesPerDay.trim()),
    messagesPerConversation: Number(values.messagesPerConversation.trim()),
    maxReplyWords: Number(values.maxReplyWords.trim()),
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
