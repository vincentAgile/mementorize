'use client';

import Link from 'next/link';
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ChatVoice, OPENING_AUDIO_HREF, sentenceSplitter } from '../../../lib/chat-voice';
import {
  CHAT_HREF,
  CHAT_SEND_HREF,
  type ChatLimit,
  type ChatMessage,
  type ChatStatus,
  type Conversation,
  type ConversationSummary,
  COUNTER_FROM,
  limitBefore,
  limitText,
  OPENING_QUESTION,
  refusal,
  SOMETHING_WENT_WRONG,
  sseReader,
} from '../../../lib/chat';
import { saveChatAutoReadAction } from './actions';
import { ChatSpeakButton } from './chat-speak-button';
import { ConversationList } from './conversation-list';
import { Feedback } from './feedback';
import { PrivacyNotice } from './privacy-notice';

type OpenStatus = Extract<ChatStatus, { enabled: true }>;

/** A bubble of the page: a message saved, or on its way (`key` stays the same while it is). */
interface Bubble {
  key: string;
  role: 'Assistant' | 'User';
  text: string;
  evaluation: ChatMessage['evaluation'];
}

const toBubble = (message: ChatMessage): Bubble => ({
  key: message.id,
  role: message.role,
  text: message.text,
  evaluation: message.evaluation,
});

/** The opening question of a conversation not created yet: shown at once, without the AI. */
const OPENING: Bubble = { key: 'opening', role: 'Assistant', text: OPENING_QUESTION, evaluation: null };

/**
 * MEM-131: the conversation. A message goes to the route that passes the
 * stream of the API on: first its evaluation (shown under it), then the
 * reply of the AI, piece by piece. Nothing is sent twice: the input is
 * read-only and « Envoyer » disabled while waiting. A failure gives the text
 * back to the input, with « Réessayer ».
 *
 * MEM-132: the messages of the AI are read aloud (lib/chat-voice.ts): the
 * opening question on arrival, read in advance; a reply sentence by sentence
 * while it is written, when « Lire automatiquement les réponses » is on.
 * Each one has its loudspeaker. Sending a message or leaving the page stops
 * the reading; the evaluation is never read by itself.
 */
export function Chat({
  status,
  conversation,
  missing,
  conversations,
  noticeAccepted,
  autoRead: initialAutoRead = true,
  voice: givenVoice,
}: {
  status: OpenStatus;
  conversation: Conversation | null;
  missing: boolean;
  conversations: ConversationSummary[];
  noticeAccepted: boolean;
  autoRead?: boolean;
  /** For the tests: the reader of the page. */
  voice?: ChatVoice;
}) {
  const [voice] = useState(() => givenVoice ?? new ChatVoice());
  const [autoRead, setAutoRead] = useState(initialAutoRead);
  const autoReadRef = useRef(autoRead);
  /** The opening question couldn't be read on arrival (no gesture yet): « Écouter » is shown. */
  const [listenHint, setListenHint] = useState(false);
  const [conversationId, setConversationId] = useState(conversation?.id ?? null);
  const [bubbles, setBubbles] = useState<Bubble[]>(conversation ? conversation.messages.map(toBubble) : [OPENING]);
  /** The reply on its way: hidden from screen readers until it is whole (read once). */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'streaming'>('idle');
  const [input, setInput] = useState('');
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(
    missing ? { message: 'Cette conversation n’existe plus : en voici une nouvelle.', retry: false } : null,
  );
  const [usedToday, setUsedToday] = useState(status.usedToday);
  const [limit, setLimit] = useState<ChatLimit | null>(() => limitBefore(status, conversation?.messages ?? []));
  const [notice, setNotice] = useState(!noticeAccepted);
  const acceptNotice = useCallback(() => setNotice(false), []);
  /** « Mes conversations », kept up to date as messages are sent. */
  const [list, setList] = useState(conversations);
  const end = useRef<HTMLLIElement>(null);
  const busy = phase !== 'idle';

  // On arrival, the opening question, read in advance on the server; the reading stops when the page is left.
  const opening = bubbles.length === 1 ? bubbles[0] : null;
  const openingKey = useRef(opening?.key);
  useEffect(() => {
    const stop = () => voice.stop();
    window.addEventListener('pagehide', stop);
    if (openingKey.current && autoReadRef.current) {
      void voice
        .speak(openingKey.current, [{ text: OPENING_QUESTION, url: OPENING_AUDIO_HREF }])
        .then((ended) => ended === 'blocked' && setListenHint(true));
    }
    return () => {
      window.removeEventListener('pagehide', stop);
      voice.stop();
    };
  }, [voice]);

  function changeAutoRead(next: boolean) {
    setAutoRead(next);
    autoReadRef.current = next;
    if (!next) voice.stop();
    void saveChatAutoReadAction(next).catch(() => false);
  }

  // The last message in sight, without taking the focus from the input.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [bubbles, streaming, phase]);

  async function send(text: string) {
    if (!text || busy || limit || notice) return;
    voice.stop(); // a message sent: the reading in progress stops
    setListenHint(false);
    const key = `pending-${Date.now()}`;
    setError(null);
    setPhase('waiting');
    setInput('');
    setBubbles((list) => [...list, { key, role: 'User', text, evaluation: null }]);
    const giveBack = (message: string, retry: boolean) => {
      voice.stop();
      setBubbles((list) => list.filter((bubble) => bubble.key !== key));
      setStreaming(null);
      setInput(text);
      setError({ message, retry });
      setPhase('idle');
    };

    let response: Response;
    try {
      response = await fetch(CHAT_SEND_HREF, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
      });
    } catch {
      return giveBack(SOMETHING_WENT_WRONG, true);
    }
    const id = response.headers.get('X-Conversation-Id');
    if (id && id !== conversationId) {
      setConversationId(id);
      // A reload reopens this conversation.
      window.history.replaceState(null, '', `${CHAT_HREF}?c=${id}`);
    }
    if (response.status === 401) {
      // A route that clears the cookies, not a page: a full navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/session-expired';
      return;
    }
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { reason?: string; retryAt?: string } | null;
      const refused = refusal(response.status, body);
      if ('limit' in refused) {
        giveBack('', false);
        setError(null);
        setLimit(refused.limit);
        return;
      }
      return giveBack(refused.error, refused.retry);
    }

    const reader = sseReader();
    const decoder = new TextDecoder();
    const chunks = response.body.getReader();
    let reply = '';
    // The reply is read sentence by sentence, as soon as each one is complete.
    const sentences = sentenceSplitter();
    const READING = 'reply';
    try {
      for (;;) {
        const { value, done } = await chunks.read();
        if (done) break;
        for (const event of reader.push(decoder.decode(value, { stream: true }))) {
          if (event.event === 'evaluation') {
            const saved = event.data.message;
            setBubbles((list) =>
              list.map((bubble) => (bubble.key === key ? { ...bubble, evaluation: saved.evaluation } : bubble)),
            );
          } else if (event.event === 'delta') {
            reply += event.data.text;
            if (autoReadRef.current) voice.append(READING, sentences.push(event.data.text));
            setStreaming(reply);
            setPhase('streaming');
          } else if (event.event === 'done') {
            const saved = event.data.message;
            if (autoReadRef.current) voice.append(READING, sentences.flush());
            voice.rename(READING, saved.id);
            setStreaming(null);
            setBubbles((list) => [...list, toBubble(saved)]);
            setPhase('idle');
            const openId = id ?? conversationId ?? '';
            setList((summaries) => {
              const known = summaries.find((summary) => summary.id === openId);
              const updated: ConversationSummary = known
                ? {
                    ...known,
                    title: known.title ?? text.slice(0, 80),
                    updatedAt: saved.createdAt,
                    messageCount: known.messageCount + 2,
                  }
                : {
                    id: openId,
                    title: text.slice(0, 80),
                    createdAt: saved.createdAt,
                    updatedAt: saved.createdAt,
                    messageCount: 3,
                  };
              return [updated, ...summaries.filter((summary) => summary.id !== openId)];
            });
            const sent = usedToday + 1;
            setUsedToday(sent);
            const userMessages = bubbles.filter((bubble) => bubble.role === 'User').length + 1;
            if (userMessages >= status.limits.messagesPerConversation) setLimit({ kind: 'conversation' });
            else if (sent >= status.limits.messagesPerDay) setLimit({ kind: 'daily', retryAt: status.resetAt });
            return;
          } else if (event.event === 'error') {
            return giveBack(SOMETHING_WENT_WRONG, true);
          }
        }
      }
    } catch {
      // The stream broke: below, as a reply that never came.
    }
    giveBack(SOMETHING_WENT_WRONG, true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input.trim());
  }

  // Entrée sends, Maj+Entrée goes to the line.
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input.trim());
    }
  }

  const max = status.limits.maxLength;
  const locked = Boolean(limit) || notice;

  return (
    <section className="chat" aria-labelledby="chat-title">
      <div className="chat__toolbar">
        <h2 id="chat-title" className="chat__title">
          Chat IA
        </h2>
        <label className="chat__auto-read">
          <input type="checkbox" checked={autoRead} onChange={(event) => changeAutoRead(event.target.checked)} />
          Lire automatiquement les réponses
        </label>
        <Link href={`${CHAT_HREF}?nouvelle=${Date.now()}`} className="button-link button-link--secondary chat__new">
          Nouvelle conversation
        </Link>
      </div>

      {notice && <PrivacyNotice onAccepted={acceptNotice} />}

      {/* role="log": what is added is read politely, once; the reply on its way is not. */}
      <ol className="chat__messages" role="log" aria-label="Conversation" lang="en">
        {bubbles.map((bubble) => (
          <li key={bubble.key} className={`chat__message chat__message--${bubble.role === 'User' ? 'user' : 'ai'}`}>
            <p className="visually-hidden" lang="fr">
              {bubble.role === 'User' ? 'Moi :' : 'IA :'}
            </p>
            <div className="chat__bubble-row">
              <p className="chat__bubble">{bubble.text}</p>
              {bubble.role === 'Assistant' && (
                <ChatSpeakButton
                  voice={voice}
                  readingKey={bubble.key}
                  text={bubble.text}
                  url={bubble.text === OPENING_QUESTION ? OPENING_AUDIO_HREF : undefined}
                  label={listenHint && bubble.key === opening?.key ? 'Écouter' : undefined}
                  onPlay={() => setListenHint(false)}
                />
              )}
            </div>
            {bubble.evaluation && (
              <Feedback written={bubble.text} evaluation={bubble.evaluation} voice={voice} readingKey={bubble.key} />
            )}
          </li>
        ))}
        {streaming !== null && (
          <li className="chat__message chat__message--ai" aria-hidden="true">
            <p className="chat__bubble">{streaming}</p>
          </li>
        )}
        {phase === 'waiting' && (
          <li className="chat__message chat__message--ai" aria-hidden="true">
            <p className="chat__bubble chat__typing">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </p>
          </li>
        )}
        <li ref={end} className="chat__end" aria-hidden="true" />
      </ol>
      <p className="visually-hidden" role="status">
        {busy ? 'L’IA écrit…' : ''}
      </p>

      <form className="chat__composer" onSubmit={submit}>
        {limit && (
          <p className="chat__limit" role="alert">
            {limitText(limit, status.limits)}
            {limit.kind === 'conversation' && (
              <>
                {' '}
                <Link href={`${CHAT_HREF}?nouvelle=${Date.now()}`}>Nouvelle conversation</Link>
              </>
            )}
          </p>
        )}
        {error && (
          <p className="form-error chat__error" role="alert">
            {error.message}{' '}
            {error.retry && (
              <button type="button" className="link-button" onClick={() => void send(input.trim())} disabled={busy}>
                Réessayer
              </button>
            )}
          </p>
        )}
        <label htmlFor="chat-input" className="visually-hidden">
          Ton message, en anglais
        </label>
        <div className="chat__input-row">
          <textarea
            id="chat-input"
            className="chat__input"
            lang="en"
            rows={2}
            maxLength={max}
            value={input}
            placeholder="Write your message in English…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={keyDown}
            // Read-only, not disabled, while waiting: the focus stays in it.
            readOnly={busy}
            aria-disabled={busy || locked}
            disabled={locked}
            aria-describedby={input.length > COUNTER_FROM ? 'chat-counter' : undefined}
          />
          <button type="submit" className="chat__send" disabled={busy || locked || !input.trim()}>
            Envoyer
          </button>
        </div>
        {input.length > COUNTER_FROM && (
          <p id="chat-counter" className="chat__counter">
            {input.length} / {max} caractères
          </p>
        )}
      </form>

      <ConversationList conversations={list} openId={conversationId} />
    </section>
  );
}
