import type { Viewport } from 'next';
import { getChatStatus, getConversation, getPreferences, listConversations } from '../../../lib/api';
import { recentConversation, UNAVAILABLE } from '../../../lib/chat';
import { Chat } from './chat';

// On a phone, the virtual keyboard shrinks the page instead of covering it:
// the input and the last message stay in sight.
export const viewport: Viewport = { viewportFit: 'cover', interactiveWidget: 'resizes-content' };

/**
 * MEM-131: the « Chat IA » of the Anglais space, a written conversation in
 * English with the AI (MEM-130), each message evaluated and corrected.
 * Opens the most recent conversation used in the last 24 hours, else a new
 * one; ?c=<id> reopens one, ?nouvelle starts another. A new conversation is
 * created with its first message: its opening question, fixed, shows at once.
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string; nouvelle?: string }> }) {
  const status = await getChatStatus();
  if (!status.enabled) {
    return (
      <section className="chat chat--off">
        <h2 className="visually-hidden">Chat IA</h2>
        <p className="form-message">{UNAVAILABLE}</p>
      </section>
    );
  }

  const { c, nouvelle } = await searchParams;
  const [preferences, conversations] = await Promise.all([getPreferences(), listConversations()]);
  const openId = c ?? (nouvelle === undefined ? recentConversation(conversations)?.id : undefined);
  const conversation = openId ? await getConversation(openId) : null;

  return (
    <Chat
      // A new key for each conversation: the state of the page starts again.
      key={conversation?.id ?? `new-${nouvelle ?? ''}`}
      status={status}
      conversation={conversation}
      missing={Boolean(c) && !conversation}
      conversations={conversations}
      noticeAccepted={preferences.chatNoticeAccepted === true}
    />
  );
}
