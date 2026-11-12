'use client';

import { useActionState, useEffect, useRef } from 'react';
import { STATE_LABELS } from '../../../../lib/admin-ai-lists';
import { type AdminChatSettings, CHAT_FIELDS, CHAT_STATE_HINTS } from '../../../../lib/admin-chat';
import { type ChatSettingsState, saveChatSettingsAction } from './actions';

/**
 * MEM-135: the block « Chat IA » of Console › Paramètres: its state, the
 * switch for everyone, the messages per user and per day (1 to 500), per
 * conversation (2 to 100) and the length of a reply of the AI (30 to 300
 * words). Apart from « Générer avec l'IA »: one off leaves the other.
 */
export function ChatSettingsForm({ settings }: { settings: AdminChatSettings }) {
  const [state, action, pending] = useActionState<ChatSettingsState & { version?: number }, FormData>(
    async (previous, formData) => ({
      ...(await saveChatSettingsAction(previous, formData)),
      version: (previous.version ?? 0) + 1,
    }),
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const values = state.values ?? {
    enabled: settings.enabled,
    messagesPerDay: String(settings.messagesPerDay),
    messagesPerConversation: String(settings.messagesPerConversation),
    maxReplyWords: String(settings.maxReplyWords),
  };
  const on = settings.state === 'active';

  return (
    <section className="admin-settings" aria-labelledby="chat-title" id="chat-settings">
      <h2 id="chat-title">Chat IA</h2>
      <p>
        État :{' '}
        <strong className={on ? 'admin-settings__on' : 'admin-settings__off'} data-state={settings.state}>
          {STATE_LABELS[settings.state]}
        </strong>
      </p>
      <p className="settings__hint">{CHAT_STATE_HINTS[settings.state]}</p>
      <form key={state.version ?? 0} ref={form} action={action} className="admin-settings__form" noValidate>
        <label className="admin-settings__check">
          <input type="checkbox" name="enabled" defaultChecked={values.enabled} />
          Activer le Chat IA pour tous les utilisateurs
        </label>
        {CHAT_FIELDS.map((field) => {
          const error = state.fieldErrors?.[field.name];
          const help = `chat-${field.name}-help`;
          return (
            <label key={field.name}>
              {field.label}
              <input
                name={field.name}
                type="number"
                inputMode="numeric"
                min={field.min}
                max={field.max}
                step={1}
                defaultValue={values[field.name]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${help} chat-${field.name}-error` : help}
                className="admin-settings__number"
              />
              <span id={help} className="settings__hint">
                De {field.min} à {field.max}.
              </span>
              {error && (
                <span id={`chat-${field.name}-error`} className="field-error">
                  {error}
                </span>
              )}
            </label>
          );
        })}
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.saved && (
          <p role="status" className="notice">
            Réglages enregistrés : ils s’appliquent dès maintenant.
          </p>
        )}
        <button type="submit" className="admin-settings__button" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </section>
  );
}
