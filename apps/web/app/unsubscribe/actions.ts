'use server';

import { ApiError, unsubscribeFromReminders } from '../../lib/api';

export interface UnsubscribeState {
  done?: boolean;
  error?: string;
}

export async function unsubscribeAction(_previous: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const user = String(formData.get('user') ?? '');
  const token = String(formData.get('token') ?? '');
  try {
    return (await unsubscribeFromReminders(user, token))
      ? { done: true }
      : { error: 'Ce lien de désinscription est invalide.' };
  } catch (error) {
    if (error instanceof ApiError || error instanceof Error)
      return { error: 'Le service ne répond pas, réessaie plus tard.' };
    throw error;
  }
}
