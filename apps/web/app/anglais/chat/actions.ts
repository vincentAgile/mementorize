'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteConversation, savePreferences } from '../../../lib/api';
import { CHAT_HREF } from '../../../lib/chat';

/** « J'ai compris »: the privacy notice is not shown again. False if it couldn't be saved (the browser keeps it). */
export async function acceptChatNoticeAction(): Promise<boolean> {
  try {
    await savePreferences({ chatNoticeAccepted: true });
    return true;
  } catch {
    return false;
  }
}

/** Deletes a conversation of « Mes conversations »; the open one gives way to a new one. */
export async function deleteConversationAction(id: string, open: boolean): Promise<void> {
  await deleteConversation(id);
  revalidatePath(CHAT_HREF);
  if (open) redirect(`${CHAT_HREF}?nouvelle=1`);
}
