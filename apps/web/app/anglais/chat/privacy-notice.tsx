'use client';

import { useEffect, useState } from 'react';
import { acceptChatNoticeAction } from './actions';

/** Where the browser keeps « J'ai compris » when the preference can't be saved. */
export const NOTICE_KEY = 'mementorize.chatNoticeAccepted';

export const NOTICE_TEXT =
  'Tes textes sont envoyés à nos prestataires pour la correction. Rien n’est utilisé pour entraîner un modèle. L’audio n’est jamais conservé.';

/**
 * MEM-131: the privacy notice, the first time. « J'ai compris » saves it in
 * the preferences of the user (or, if that fails, in the browser): it is not
 * shown again. Nothing is sent before.
 */
export function PrivacyNotice({ onAccepted }: { onAccepted: () => void }) {
  const [pending, setPending] = useState(false);

  // Already understood on this browser, when the server couldn't keep it.
  useEffect(() => {
    try {
      if (localStorage.getItem(NOTICE_KEY) === 'true') onAccepted();
    } catch {
      // No storage: the notice stays.
    }
  }, [onAccepted]);

  async function accept() {
    setPending(true);
    const saved = await acceptChatNoticeAction().catch(() => false);
    if (!saved) {
      try {
        localStorage.setItem(NOTICE_KEY, 'true');
      } catch {
        // Shown again next time: nothing worse.
      }
    }
    onAccepted();
  }

  return (
    <div className="notice chat__notice" role="region" aria-label="Confidentialité">
      <p>{NOTICE_TEXT}</p>
      <button type="button" className="chat__send" onClick={() => void accept()} disabled={pending}>
        J’ai compris
      </button>
    </div>
  );
}
