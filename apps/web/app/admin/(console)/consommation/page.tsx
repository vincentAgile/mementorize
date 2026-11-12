import type { Metadata } from 'next';
import { type AiListTopUser, type AiListUsageDay, formatCount, STATE_HINTS } from '../../../../lib/admin-ai-lists';
import { getAiListSettings, getAiListUsage, getChatSettings, getChatUsage } from '../../../../lib/admin-api';
import { CHAT_STATE_HINTS, type ChatTopUser, type ChatUsageDay } from '../../../../lib/admin-chat';
import { type UsageColumn, UsageSection } from './usage-section';

export const metadata: Metadata = { title: 'Consommation IA' };

const TOKENS = <T extends { inputTokens: number; outputTokens: number }>(): UsageColumn<T>[] => [
  { label: 'Jetons d’entrée', value: (row) => row.inputTokens },
  { label: 'Jetons de sortie', value: (row) => row.outputTokens },
];

const CHAT_DAYS: UsageColumn<ChatUsageDay>[] = [
  { label: 'Conversations', value: (day) => day.conversations },
  { label: 'Messages', value: (day) => day.messages },
  { label: 'Utilisateurs actifs', value: (day) => day.activeUsers, total: false },
  ...TOKENS<ChatUsageDay>(),
];
const CHAT_TOP: UsageColumn<ChatTopUser>[] = [
  { label: 'Messages', value: (user) => user.messages },
  ...TOKENS<ChatTopUser>(),
];

const AI_LIST_DAYS: UsageColumn<AiListUsageDay>[] = [
  { label: 'Générations', value: (day) => day.generations },
  { label: 'Utilisateurs actifs', value: (day) => day.activeUsers, total: false },
  { label: 'Cartes proposées', value: (day) => day.proposed },
  { label: 'Cartes ajoutées', value: (day) => day.added },
  ...TOKENS<AiListUsageDay>(),
];
const AI_LIST_TOP: UsageColumn<AiListTopUser>[] = [
  { label: 'Générations', value: (user) => user.generations },
  ...TOKENS<AiListTopUser>(),
];

/**
 * What the AI costs (MEM-135, MEM-143): the Chat IA and the generations of
 * cards, each per day over the last 30 days and with the 10 biggest users of
 * the month. Numbers only: no text of a conversation, no theme, no card.
 */
export default async function AiUsagePage() {
  const [chat, chatUsage, aiLists, aiListUsage] = await Promise.all([
    getChatSettings(),
    getChatUsage(),
    getAiListSettings(),
    getAiListUsage(),
  ]);
  return (
    <>
      <h1>Consommation IA</h1>
      <UsageSection
        id="chat"
        title="Consommation du Chat IA"
        state={chat.state}
        limits={
          <>
            {formatCount(chat.messagesPerDay)} messages par utilisateur et par jour,{' '}
            {formatCount(chat.messagesPerConversation)} par conversation, réponses de {formatCount(chat.maxReplyWords)}{' '}
            mots au plus
          </>
        }
        hint={chat.state === 'active' ? null : CHAT_STATE_HINTS[chat.state]}
        days={chatUsage.days}
        dayColumns={CHAT_DAYS}
        isEmpty={(day) => day.conversations === 0 && day.messages === 0}
        month={chatUsage.month}
        top={chatUsage.top}
        topColumns={CHAT_TOP}
        noTop="Aucun message ce mois-ci."
      />
      <UsageSection
        id="ai-lists"
        title="Consommation de la génération de cartes"
        state={aiLists.state}
        limits={<>{formatCount(aiLists.generationsPerDay)} générations par utilisateur et par jour</>}
        hint={aiLists.state === 'active' ? null : STATE_HINTS[aiLists.state]}
        days={aiListUsage.days}
        dayColumns={AI_LIST_DAYS}
        isEmpty={(day) => day.generations === 0 && day.added === 0}
        month={aiListUsage.month}
        top={aiListUsage.top}
        topColumns={AI_LIST_TOP}
        noTop="Aucune génération ce mois-ci."
      />
      <p className="settings__hint">
        Des compteurs seulement : ni le texte des conversations, ni les thèmes saisis, ni les cartes ne sont enregistrés
        pour la console. Conservés 13 mois.
      </p>
    </>
  );
}
