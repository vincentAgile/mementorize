'use server';

import { revalidatePath } from 'next/cache';
import { setUserChatAi } from '../../../lib/admin-api';

/** MEM-144: grants or withdraws the Chat IA of an account, saved at once. */
export async function setChatAiAction(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  const ok = await setUserChatAi(id, enabled);
  if (ok) revalidatePath('/admin');
  return { ok };
}
