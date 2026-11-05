'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CHAT_HREF, type ConversationSummary } from '../../../lib/chat';
import { deleteConversationAction } from './actions';

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/**
 * MEM-131: « Mes conversations », folded: each one with its date and the
 * first message of the user, to reopen or to delete (after a confirmation).
 */
export function ConversationList({
  conversations,
  openId,
}: {
  conversations: ConversationSummary[];
  openId: string | null;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (conversations.length === 0) return null;

  return (
    <details className="chat-list">
      <summary>Mes conversations ({conversations.length})</summary>
      <ul className="chat-list__items">
        {conversations.map((conversation) => {
          const open = conversation.id === openId;
          const title = conversation.title ?? 'Conversation sans message';
          return (
            <li key={conversation.id} className="chat-list__item">
              <div className="chat-list__text">
                <time dateTime={conversation.updatedAt} className="chat-list__date">
                  {dateTime(conversation.updatedAt)}
                </time>
                <span className="chat-list__title" lang={conversation.title ? 'en' : undefined}>
                  {title}
                </span>
              </div>
              <div className="chat-list__actions">
                {confirming === conversation.id ? (
                  <>
                    <span>Supprimer cette conversation ?</span>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={pending}
                      onClick={() => startTransition(() => deleteConversationAction(conversation.id, open))}
                    >
                      {pending ? 'Suppression…' : 'Supprimer'}
                    </button>
                    <button type="button" className="link-button" onClick={() => setConfirming(null)}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    {open ? (
                      <span className="chat-list__open">Ouverte</span>
                    ) : (
                      <Link href={`${CHAT_HREF}?c=${conversation.id}`} aria-label={`Rouvrir : ${title}`}>
                        Rouvrir
                      </Link>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`Supprimer : ${title}`}
                      onClick={() => setConfirming(conversation.id)}
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
