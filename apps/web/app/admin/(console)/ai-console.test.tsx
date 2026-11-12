// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiListUsageReport } from '../../../lib/admin-ai-lists';

const saveAiListSettings = vi.fn();
const getAiListSettings = vi.fn();
const getAiListUsage = vi.fn();
const saveChatSettings = vi.fn();
const getChatSettings = vi.fn();
const getChatUsage = vi.fn();
vi.mock('../../../lib/admin-api', () => ({
  saveAiListSettings,
  getAiListSettings,
  getAiListUsage,
  saveChatSettings,
  getChatSettings,
  getChatUsage,
  setUserChatAi: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { saveAiListSettingsAction, saveChatSettingsAction } = await import('./parametres/actions');
const { AiListSettingsForm } = await import('./parametres/ai-list-settings');
const { ChatSettingsForm } = await import('./parametres/chat-settings');
const { default: AiUsagePage } = await import('./consommation/page');
const { UsersTable } = await import('./users-table');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, '’')
    .replace(/\s+/g, ' ');
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  saveAiListSettings.mockReset();
  saveChatSettings.mockReset();
});

const chat = { enabled: true, messagesPerDay: 30, messagesPerConversation: 20, maxReplyWords: 120 };

describe('Console › Paramètres: « Chat IA » (MEM-135)', () => {
  it('its state, the switch and the three limits, with their bounds', () => {
    const html = renderToStaticMarkup(<ChatSettingsForm settings={{ ...chat, state: 'active' }} />);
    expect(text(html)).toContain('Chat IA');
    expect(text(html)).toContain('État : Active');
    expect(html).toMatch(/<input type="checkbox" name="enabled" checked=""/);
    expect(text(html)).toContain('Activer le Chat IA pour tous les utilisateurs');
    for (const [name, value, min, max] of [
      ['messagesPerDay', 30, 1, 500],
      ['messagesPerConversation', 20, 2, 100],
      ['maxReplyWords', 120, 30, 300],
    ]) {
      expect(html).toMatch(new RegExp(`min="${min}" max="${max}"[^>]*name="${name}" value="${value}"`));
    }
    expect(text(html)).toContain('Messages par utilisateur et par jour');
    expect(text(html)).toContain('Messages par conversation');
    expect(text(html)).toContain('Longueur maximale d’une réponse (mots)');
    const off = text(renderToStaticMarkup(<ChatSettingsForm settings={{ ...chat, enabled: false, state: 'off' }} />));
    expect(off).toContain('État : Coupée par l’administrateur');
    expect(off).toContain('Le Chat IA est masqué pour tous les utilisateurs.');
    expect(text(renderToStaticMarkup(<ChatSettingsForm settings={{ ...chat, state: 'unconfigured' }} />))).toContain(
      'État : Non configurée',
    );
  });

  it('checks each number first, then saves', async () => {
    const values = { messagesPerDay: '0', messagesPerConversation: '101', maxReplyWords: '' };
    expect(await saveChatSettingsAction({}, form({ enabled: 'on', ...values }))).toEqual({
      values: { enabled: true, ...values },
      fieldErrors: {
        messagesPerDay: 'Saisis un nombre entre 1 et 500.',
        messagesPerConversation: 'Saisis un nombre entre 2 et 100.',
        maxReplyWords: 'Saisis un nombre de mots.',
      },
    });
    expect(saveChatSettings).not.toHaveBeenCalled();
    saveChatSettings.mockResolvedValueOnce({ ok: true, settings: {} });
    expect(
      await saveChatSettingsAction(
        {},
        form({ messagesPerDay: ' 40 ', messagesPerConversation: '10', maxReplyWords: '80' }),
      ),
    ).toEqual({ saved: true });
    expect(saveChatSettings).toHaveBeenCalledWith({
      enabled: false,
      messagesPerDay: 40,
      messagesPerConversation: 10,
      maxReplyWords: 80,
    });
    saveChatSettings.mockResolvedValueOnce({ ok: false, status: 400 });
    expect(
      (
        await saveChatSettingsAction(
          {},
          form({ messagesPerDay: '40', messagesPerConversation: '10', maxReplyWords: '80' }),
        )
      ).error,
    ).toBe('Impossible d’enregistrer les réglages.');
  });
});

describe('Console › Paramètres: « Générer avec l’IA » (MEM-143)', () => {
  it('its state, the switch and the quota', () => {
    const html = renderToStaticMarkup(
      <AiListSettingsForm settings={{ enabled: true, generationsPerDay: 10, state: 'active' }} />,
    );
    expect(text(html)).toContain('Générer avec l’IA');
    expect(text(html)).toContain('État : Active');
    expect(html).toMatch(/<input type="checkbox" name="enabled" checked=""/);
    expect(html).toContain('name="generationsPerDay"');
    expect(html).toContain('value="10"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="200"');
    expect(text(html)).toContain('De 1 à 200. Indépendant du Chat IA.');

    const off = text(
      renderToStaticMarkup(<AiListSettingsForm settings={{ enabled: false, generationsPerDay: 5, state: 'off' }} />),
    );
    expect(off).toContain('État : Coupée par l’administrateur');
    expect(off).toContain('« Générer avec l’IA » est grisé pour tous les utilisateurs.');
    const none = text(
      renderToStaticMarkup(
        <AiListSettingsForm settings={{ enabled: true, generationsPerDay: 10, state: 'unconfigured' }} />,
      ),
    );
    expect(none).toContain('État : Non configurée');
    expect(none).toContain('Aucun modèle d’IA n’est configuré sur le serveur');
  });

  it('checks the number first, then saves; the server down is said', async () => {
    expect(await saveAiListSettingsAction({}, form({ enabled: 'on', generationsPerDay: '0' }))).toEqual({
      values: { enabled: true, generationsPerDay: '0' },
      fieldError: 'Saisis un nombre entre 1 et 200.',
    });
    expect(saveAiListSettings).not.toHaveBeenCalled();

    saveAiListSettings.mockResolvedValueOnce({ ok: true, settings: {} });
    expect(await saveAiListSettingsAction({}, form({ generationsPerDay: ' 25 ' }))).toEqual({ saved: true });
    expect(saveAiListSettings).toHaveBeenCalledWith({ enabled: false, generationsPerDay: 25 });

    saveAiListSettings.mockResolvedValueOnce({ ok: false, status: null });
    expect((await saveAiListSettingsAction({}, form({ enabled: 'on', generationsPerDay: '5' }))).error).toBe(
      'Le serveur ne répond pas. Réessaie dans un instant.',
    );
  });

  it('the error under the field, the field focused', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<AiListSettingsForm settings={{ enabled: true, generationsPerDay: 10, state: 'active' }} />));
    const input = container.querySelector<HTMLInputElement>('input[name="generationsPerDay"]')!;
    input.value = '500';
    await act(async () => container.querySelector('form')!.requestSubmit());
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
    const field = container.querySelector<HTMLInputElement>('input[name="generationsPerDay"]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.value).toBe('500');
    expect(container.querySelector('#ai-lists-generations-error')!.textContent).toBe(
      'Saisis un nombre entre 1 et 200.',
    );
    expect(document.activeElement).toBe(field);
    act(() => root.unmount());
    container.remove();
  });
});

describe('Console › Consommation IA (MEM-143)', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-11-${String(30 - i).padStart(2, '0')}`.replace('2026-11-00', '2026-10-31'),
    generations: i === 0 ? 3 : 0,
    activeUsers: i === 0 ? 2 : 0,
    proposed: i === 0 ? 25 : 0,
    added: i === 0 ? 12 : 0,
    inputTokens: i === 0 ? 1200 : 0,
    outputTokens: i === 0 ? 3400 : 0,
  }));
  const report: AiListUsageReport = {
    days,
    month: '2026-11',
    top: [
      {
        id: 'u1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        generations: 2,
        inputTokens: 800,
        outputTokens: 2000,
      },
    ],
  };

  const chatReport = {
    days: days.map(({ day }, i) => ({
      day,
      conversations: i === 0 ? 4 : 0,
      messages: i === 0 ? 17 : 0,
      activeUsers: i === 0 ? 3 : 0,
      inputTokens: i === 0 ? 9000 : 0,
      outputTokens: i === 0 ? 2500 : 0,
    })),
    month: '2026-11',
    top: [],
  };

  it('the state, a row per day, the totals, the top users with their « fiche »', async () => {
    getAiListSettings.mockResolvedValue({ enabled: true, generationsPerDay: 10, state: 'active' });
    getAiListUsage.mockResolvedValue(report);
    getChatSettings.mockResolvedValue({ ...chat, state: 'active' });
    getChatUsage.mockResolvedValue(chatReport);
    const html = renderToStaticMarkup(await AiUsagePage());
    // The Chat IA first (MEM-135), then the generations of cards.
    expect(text(html)).toMatch(/Consommation du Chat IA.*Consommation de la génération de cartes/);
    expect(text(html)).toContain(
      'État : Active · 30 messages par utilisateur et par jour, 20 par conversation, réponses de 120 mots au plus · Modifier',
    );
    expect(html).toContain('href="/admin/parametres#chat-settings"');
    expect(text(html)).toContain('Jour Conversations Messages Utilisateurs actifs Jetons d’entrée Jetons de sortie');
    expect(text(html)).toMatch(/30 jours 4 17 — 9\s?000 2\s?500/);
    expect(text(html)).toContain('Aucun message ce mois-ci.');
    expect(text(html)).toContain('État : Active · 10 générations par utilisateur et par jour · Modifier');
    expect(html).toContain('href="/admin/parametres#ai-lists-settings"');
    const bodies = html.match(/<tbody>[\s\S]*?<\/tbody>/g)!;
    expect(bodies.map((body) => body.match(/<tr/g)!.length)).toEqual([30, 30, 1]); // the days twice, the top user
    expect(text(html)).toContain(
      'Jour Générations Utilisateurs actifs Cartes proposées Cartes ajoutées Jetons d’entrée Jetons de sortie',
    );
    expect(text(html)).toMatch(/30 jours 3 — 25 12 1\s?200 3\s?400/);
    expect(text(html)).toContain('Les 10 plus gros utilisateurs de novembre 2026');
    expect(html).toContain('href="/admin?recherche=ada%40example.com"');
    expect(text(html)).toContain('Ada Lovelace');
  });

  it('no generation this month; off', async () => {
    getAiListSettings.mockResolvedValue({ enabled: false, generationsPerDay: 10, state: 'off' });
    getAiListUsage.mockResolvedValue({ ...report, top: [] });
    getChatSettings.mockResolvedValue({ ...chat, state: 'unconfigured' });
    getChatUsage.mockResolvedValue(chatReport);
    const html = text(renderToStaticMarkup(await AiUsagePage()));
    expect(html).toContain('État : Coupée par l’administrateur');
    expect(html).toContain('État : Non configurée');
    expect(html).toContain('Aucun modèle d’IA n’est configuré sur le serveur : le Chat IA reste indisponible');
    expect(html).toContain('Aucune génération ce mois-ci.');
  });
});

describe('The « fiche » of a user (MEM-143)', () => {
  it('the users searched on the e-mail given, its detail open', () => {
    const counts = { Waiting: 0, ToLearn: 0, Learning: 0, Learned: 0, total: 0 };
    const space = {
      Vocabulary: counts,
      Quote: counts,
      MindMap: { total: 0, branchesInReview: 0, branchesLearned: 0 },
      total: 0,
    };
    const user = (id: string, email: string) => ({
      id,
      email,
      firstName: null,
      lastName: null,
      createdAt: '2026-11-01T10:00:00Z',
      lastActiveAt: null,
      chatAiEnabled: false,
      counts: space,
    });
    const html = renderToStaticMarkup(
      <UsersTable
        users={[user('u1', 'ada@example.com'), user('u2', 'bob@example.com')]}
        totals={space}
        now="2026-11-12T10:00:00Z"
        initialSearch="ada@example.com"
      />,
    );
    expect(html).toContain('value="ada@example.com"');
    expect(html).toContain('ada@example.com');
    expect(html).not.toContain('bob@example.com');
    expect(html).toContain('aria-expanded="true"');
  });
});
