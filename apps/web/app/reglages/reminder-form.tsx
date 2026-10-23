'use client';

import { useActionState, useSyncExternalStore } from 'react';
import type { ReminderSettings } from '../../lib/types';
import { saveRemindersAction, sendTestAction } from './actions';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// The browser's time zone doesn't change while the page is open.
const subscribeToNothing = () => () => {};

export function ReminderForm({ settings }: { settings: ReminderSettings }) {
  const [saveState, saveAction, saving] = useActionState(saveRemindersAction, {});
  const [testState, testAction, testing] = useActionState(sendTestAction, {});

  // The hour is understood in the browser's time zone, sent along with it.
  // The server doesn't know that time zone: its render shows the saved one,
  // the browser then switches to its own.
  const timeZone = useSyncExternalStore(
    subscribeToNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => settings.timeZone,
  );

  return (
    <section className="settings">
      <h2>Rappel par e-mail</h2>
      <p className="page__subtitle">
        Un e-mail par jour, à l’heure choisie, s’il y a des cartes à réviser. Rien les jours où tout est à jour.
      </p>

      {!settings.emailAvailable && (
        <p className="notice">L’envoi d’e-mails n’est pas encore configuré sur ce serveur : aucun rappel ne partira.</p>
      )}

      {/* After saving, React resets the form to its default values; the key
          remounts it with the saved ones (a <select> ignores a new defaultValue). */}
      <form key={`${settings.enabled}-${settings.hour}`} action={saveAction} className="settings__form">
        <label className="settings__check">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          M’envoyer un rappel des révisions du jour
        </label>
        <label>
          Heure du rappel
          <select name="hour" defaultValue={settings.hour}>
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}
                {'\u00a0'}h
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="timeZone" value={timeZone} />
        <p className="settings__hint">Fuseau horaire : {timeZone}</p>

        {saveState.error && (
          <p role="alert" className="form-error">
            {saveState.error}
          </p>
        )}
        {saveState.message && <p className="notice">{saveState.message}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <form action={testAction} className="settings__form">
        <p className="settings__hint">Pour vérifier que les e-mails arrivent bien, sans attendre l’heure du rappel :</p>
        {testState.error && (
          <p role="alert" className="form-error">
            {testState.error}
          </p>
        )}
        {testState.message && <p className="notice">{testState.message}</p>}
        <button type="submit" className="button--secondary" disabled={testing || !settings.emailAvailable}>
          {testing ? 'Envoi…' : 'M’envoyer un e-mail de test'}
        </button>
      </form>
    </section>
  );
}
