// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatStatus, Conversation, ConversationSummary, Evaluation } from '../../../lib/chat';

const acceptChatNoticeAction = vi.fn(async () => true);
const deleteConversationAction = vi.fn(async () => undefined);
vi.mock('./actions', () => ({ acceptChatNoticeAction, deleteConversationAction }));
const getChatStatus = vi.fn();
const getConversation = vi.fn();
const getPreferences = vi.fn();
const listConversations = vi.fn();
vi.mock('../../../lib/api', () => ({ getChatStatus, getConversation, getPreferences, listConversations }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { Chat } = await import('./chat');
const { default: ChatPage } = await import('./page');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const limits = { messagesPerDay: 30, messagesPerConversation: 20, maxLength: 1000 };
const status: Extract<ChatStatus, { enabled: true }> = {
  enabled: true,
  limits,
  usedToday: 0,
  resetAt: '2026-11-05T23:00:00.000Z',
};
const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm0',
  position: 0,
  role: 'Assistant',
  text: 'What do you want to talk about today?',
  evaluation: null,
  createdAt: '2026-11-05T20:00:00.000Z',
  ...overrides,
});
const wrong: Evaluation = {
  corrected: 'Yesterday I went to the cinema.',
  corrections: [
    { type: 'grammar', original: 'go', suggestion: 'went', explanation: 'Use the past tense for yesterday.' },
  ],
  praise: null,
};

/** A response of the route, as server-sent events; `hold` keeps the stream open until released. */
function sse(events: { event: string; data: unknown }[], { hold = false, id = 'c1' } = {}) {
  const encoder = new TextEncoder();
  let release: () => void = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [index, event] of events.entries()) {
        controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
        if (hold && index === 0) await new Promise<void>((resolve) => (release = resolve));
      }
      controller.close();
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'X-Conversation-Id': id },
  });
  return { response, release: () => release() };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
};

let root: Root;
let container: HTMLDivElement;
function mount(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
}
const input = () => container.querySelector<HTMLTextAreaElement>('#chat-input')!;
const sendButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Envoyer')!;
const bubbles = () =>
  [...container.querySelectorAll('.chat__messages > li:not([aria-hidden])')].map((li) => ({
    who: li.classList.contains('chat__message--user') ? 'me' : 'ai',
    text: li.querySelector('.chat__bubble')?.textContent,
    feedback: li.querySelector('.chat-feedback')?.textContent ?? null,
  }));
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function pressEnter(shiftKey = false) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true }));
  });
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/anglais/chat');
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe('« Chat IA »: the conversation (MEM-131)', () => {
  it('opens on the fixed question of the AI, without calling the model', () => {
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted />);
    expect(bubbles()).toEqual([{ who: 'ai', text: 'What do you want to talk about today?', feedback: null }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendButton().disabled).toBe(true); // empty input
    type('   ');
    expect(sendButton().disabled).toBe(true);
  });

  it('sends with Entrée, shows the evaluation before the reply, then the reply as it comes', async () => {
    const stream = sse(
      [
        {
          event: 'evaluation',
          data: {
            message: message({ id: 'm1', role: 'User', text: 'Yesterday I go to the cinema.', evaluation: wrong }),
          },
        },
        { event: 'delta', data: { text: 'Nice!' } },
        { event: 'delta', data: { text: ' What did you see?' } },
        { event: 'done', data: { message: message({ id: 'm2', position: 2, text: 'Nice! What did you see?' }) } },
      ],
      { hold: true },
    );
    fetchMock.mockResolvedValueOnce(stream.response);
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted />);

    type('Yesterday I go to the cinema.');
    pressEnter(true); // Maj+Entrée: a new line, nothing sent
    expect(fetchMock).not.toHaveBeenCalled();
    pressEnter();
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      conversationId: null,
      text: 'Yesterday I go to the cinema.',
    });
    // The evaluation is there, the reply not yet; no second message while waiting.
    expect(bubbles()[1]).toMatchObject({ who: 'me', text: 'Yesterday I go to the cinema.' });
    expect(bubbles()[1].feedback).toContain('Corrected version');
    expect(container.querySelector('.chat-feedback__change')?.textContent).toBe('went');
    expect(bubbles()[1].feedback).toContain('grammar go → becomes went — Use the past tense for yesterday.');
    expect(bubbles()).toHaveLength(2);
    expect(input().readOnly).toBe(true);
    expect(sendButton().disabled).toBe(true);
    pressEnter();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stream.release();
    await flush();
    expect(bubbles()[2]).toEqual({ who: 'ai', text: 'Nice! What did you see?', feedback: null });
    expect(input().readOnly).toBe(false);
    expect(input().value).toBe('');
    expect(window.location.search).toBe('?c=c1'); // a reload reopens it
    expect(container.querySelector('.chat-list summary')?.textContent).toBe('Mes conversations (1)');
  });

  it('says so when the message is correct', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        {
          event: 'evaluation',
          data: {
            message: message({
              id: 'm1',
              role: 'User',
              text: 'I love hiking.',
              evaluation: { corrected: 'I love hiking.', corrections: [], praise: 'Well done!' },
            }),
          },
        },
        { event: 'delta', data: { text: 'Me too!' } },
        { event: 'done', data: { message: message({ id: 'm2', position: 2, text: 'Me too!' }) } },
      ]).response,
    );
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted />);
    type('I love hiking.');
    act(() => sendButton().click());
    await flush();
    expect(bubbles()[1].feedback).toBe('FeedbackGreat, no corrections needed.');
    expect(container.textContent).not.toContain('Copier la version corrigée');
  });

  it('gives the text back with « Réessayer » when the service fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'The AI is busy' }, { status: 503 }));
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted />);
    type('Hello there.');
    act(() => sendButton().click());
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Une erreur est survenue, réessaie.');
    expect(input().value).toBe('Hello there.');
    expect(bubbles()).toHaveLength(1);

    // Failing in the middle of the reply: the same.
    fetchMock.mockResolvedValueOnce(
      sse([
        {
          event: 'evaluation',
          data: { message: message({ id: 'm1', role: 'User', text: 'Hello there.', evaluation: wrong }) },
        },
        { event: 'delta', data: { text: 'Hel' } },
        { event: 'error', data: { statusCode: 503, message: 'busy' } },
      ]).response,
    );
    act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Réessayer')!.click());
    await flush();
    expect(input().value).toBe('Hello there.');
    expect(bubbles()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      sse([
        {
          event: 'evaluation',
          data: { message: message({ id: 'm1', role: 'User', text: 'Hello there.', evaluation: wrong }) },
        },
        { event: 'delta', data: { text: 'Hi!' } },
        { event: 'done', data: { message: message({ id: 'm2', position: 2, text: 'Hi!' }) } },
      ]).response,
    );
    act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Réessayer')!.click());
    await flush();
    expect(bubbles().map((b) => b.text)).toEqual(['What do you want to talk about today?', 'Hello there.', 'Hi!']);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('stops at the limits, with when to come back', async () => {
    mount(
      <Chat
        // The next midnight is always to come: one hour from now, whatever the day of the test.
        status={{ ...status, usedToday: 30, resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }}
        conversation={null}
        missing={false}
        conversations={[]}
        noticeAccepted
      />,
    );
    expect(container.querySelector('.chat__limit')?.textContent).toMatch(
      /^Tu as atteint la limite de 30 messages par jour\. Tu pourras reprendre (demain )?à \d\d:\d\d\.$/,
    );
    expect(input().disabled).toBe(true);
    act(() => root.unmount());

    fetchMock.mockResolvedValueOnce(Response.json({ reason: 'conversation-limit' }, { status: 429 }));
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted />);
    type('One more.');
    act(() => sendButton().click());
    await flush();
    expect(container.querySelector('.chat__limit')?.textContent).toBe(
      'Cette conversation a atteint la limite de 20 messages. Démarre une nouvelle conversation pour continuer. Nouvelle conversation',
    );
    expect(input().disabled).toBe(true);
    expect(container.querySelector('.chat__limit a')?.getAttribute('href')).toMatch(/^\/anglais\/chat\?nouvelle=/);
  });

  it('reopens a conversation with its evaluations, and counts its characters past 800', () => {
    const conversation: Conversation = {
      id: 'c9',
      title: 'Yesterday I go to the cinema.',
      createdAt: '2026-11-05T19:00:00.000Z',
      updatedAt: '2026-11-05T19:01:00.000Z',
      messages: [
        message({}),
        message({ id: 'm1', position: 1, role: 'User', text: 'Yesterday I go to the cinema.', evaluation: wrong }),
        message({ id: 'm2', position: 2, text: 'Nice! What did you see?' }),
      ],
    };
    mount(<Chat status={status} conversation={conversation} missing={false} conversations={[]} noticeAccepted />);
    expect(bubbles().map((b) => b.who)).toEqual(['ai', 'me', 'ai']);
    expect(bubbles()[1].feedback).toContain('Yesterday I went to the cinema.');
    type('a'.repeat(800));
    expect(container.querySelector('.chat__counter')).toBeNull();
    type('a'.repeat(801));
    expect(container.querySelector('.chat__counter')?.textContent).toBe('801 / 1000 caractères');
    expect(input().maxLength).toBe(1000);
  });

  it('shows the privacy notice first, and nothing is sent before « J’ai compris »', async () => {
    mount(<Chat status={status} conversation={null} missing={false} conversations={[]} noticeAccepted={false} />);
    expect(container.querySelector('.chat__notice')?.textContent).toContain(
      'Tes textes sont envoyés à nos prestataires pour la correction. Rien n’est utilisé pour entraîner un modèle. L’audio n’est jamais conservé.',
    );
    expect(input().disabled).toBe(true);
    await act(async () =>
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'J’ai compris')!.click(),
    );
    await flush();
    expect(acceptChatNoticeAction).toHaveBeenCalled();
    expect(container.querySelector('.chat__notice')).toBeNull();
    expect(input().disabled).toBe(false);
  });

  it('lists the conversations, to reopen or delete after a confirmation', async () => {
    const conversations: ConversationSummary[] = [
      {
        id: 'c1',
        title: 'Football.',
        createdAt: '2026-11-05T19:00:00Z',
        updatedAt: '2026-11-05T19:00:00Z',
        messageCount: 3,
      },
      { id: 'c2', title: null, createdAt: '2026-11-04T19:00:00Z', updatedAt: '2026-11-04T19:00:00Z', messageCount: 1 },
    ];
    mount(<Chat status={status} conversation={null} missing={false} conversations={conversations} noticeAccepted />);
    const items = [...container.querySelectorAll('.chat-list__item')];
    expect(items.map((item) => item.querySelector('.chat-list__title')?.textContent)).toEqual([
      'Football.',
      'Conversation sans message',
    ]);
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/anglais/chat?c=c1');
    act(() => items[1].querySelector<HTMLButtonElement>('button')!.click());
    expect(items[1].textContent).toContain('Supprimer cette conversation ?');
    expect(deleteConversationAction).not.toHaveBeenCalled();
    await act(async () => items[1].querySelector<HTMLButtonElement>('.danger-button')!.click());
    expect(deleteConversationAction).toHaveBeenCalledWith('c2', false);
  });
});

describe('« Chat IA »: the page (MEM-131)', () => {
  const text = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;/g, '’')
      .replace(/\s+/g, ' ');

  it('says it is not available when the API does not offer it', async () => {
    getChatStatus.mockResolvedValueOnce({ enabled: false });
    const html = renderToStaticMarkup(await ChatPage({ searchParams: Promise.resolve({}) }));
    expect(text(html)).toContain('Le Chat IA n’est pas disponible pour le moment.');
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('opens the conversation used in the last 24 hours, else a new one', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    getPreferences.mockResolvedValue({ chatNoticeAccepted: true });
    getConversation.mockResolvedValue({
      id: 'c1',
      title: 'Football.',
      createdAt: recent,
      updatedAt: recent,
      messages: [message({}), message({ id: 'm1', position: 1, role: 'User', text: 'Football.', evaluation: wrong })],
    });

    getChatStatus.mockResolvedValueOnce(status);
    listConversations.mockResolvedValueOnce([
      { id: 'c1', title: 'Football.', createdAt: recent, updatedAt: recent, messageCount: 2 },
    ]);
    let html = renderToStaticMarkup(await ChatPage({ searchParams: Promise.resolve({}) }));
    expect(getConversation).toHaveBeenCalledWith('c1');
    expect(text(html)).toContain('Football.');

    getConversation.mockClear();
    getChatStatus.mockResolvedValueOnce(status);
    listConversations.mockResolvedValueOnce([
      { id: 'c1', title: 'Football.', createdAt: old, updatedAt: old, messageCount: 2 },
    ]);
    html = renderToStaticMarkup(await ChatPage({ searchParams: Promise.resolve({}) }));
    expect(getConversation).not.toHaveBeenCalled();
    expect(text(html)).toContain('What do you want to talk about today?');

    getChatStatus.mockResolvedValueOnce(status);
    listConversations.mockResolvedValueOnce([
      { id: 'c1', title: 'Football.', createdAt: recent, updatedAt: recent, messageCount: 2 },
    ]);
    await ChatPage({ searchParams: Promise.resolve({ nouvelle: '1' }) });
    expect(getConversation).not.toHaveBeenCalled();
  });
});
