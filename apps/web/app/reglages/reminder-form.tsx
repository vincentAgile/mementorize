'use client';

import { useActionState, useId, useState, useSyncExternalStore } from 'react';
import type { ReminderSettings } from '../../lib/types';
import { saveRemindersAction, sendTestAction } from './actions';
import { SaveStatus, useAutoSave } from './auto-save';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// The browser's time zone doesn't change while the page is open.
const subscribeToNothing = () => () => {};

/**
 * The daily reminder e-mail (phase 11): on or off, and its hour. Both are
 * saved together, as soon as one changes (MEM-79), with the browser's time
 * zone; the status shows next to the one changed.
 */
export function ReminderForm({ settings }: { settings: ReminderSettings }) {
  const [testState, testAction, testing] = useActionState(sendTestAction, {});

  // The hour is understood in the browser's time zone, sent along with it.
  // The server doesn't know that time zone: its render shows the saved one,
  // the browser then switches to its own.
  const timeZone = useSyncExternalStore(
    subscribeToNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => settings.timeZone,
  );
  const reminder = useAutoSave({ enabled: settings.enabled, hour: settings.hour }, (value) =>
    saveRemindersAction({ ...value, timeZone }),
  );
  // Where the status of the last change shows: next to the control changed.
  const [changed, setChanged] = useState<'enabled' | 'hour' | null>(null);
  const enabledStatus = useId();
  const hourStatus = useId();
  const status = (field: 'enabled' | 'hour', id: string) => (
    <SaveStatus
      id={id}
      status={changed === field ? reminder.status : 'idle'}
      message={reminder.message}
      onRetry={reminder.retry}
    />
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

      <div className="settings__form">
        <div className="settings__field">
          <label className="settings__check">
            <input
              type="checkbox"
              name="enabled"
              checked={reminder.value.enabled}
              aria-describedby={enabledStatus}
              onChange={(event) => {
                setChanged('enabled');
                reminder.commit({ ...reminder.value, enabled: event.target.checked });
              }}
            />
            M’envoyer un rappel des révisions du jour
          </label>
          {status('enabled', enabledStatus)}
        </div>
        <div className="settings__field">
          <label>
            Heure du rappel
            <select
              name="hour"
              value={reminder.value.hour}
              aria-describedby={hourStatus}
              onChange={(event) => {
                setChanged('hour');
                reminder.commit({ ...reminder.value, hour: Number(event.target.value) });
              }}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}
                  {' '}h
                </option>
              ))}
            </select>
          </label>
          {status('hour', hourStatus)}
        </div>
        <p className="settings__hint">Fuseau horaire : {timeZone}</p>
      </div>

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
