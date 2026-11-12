'use client';

import { useActionState } from 'react';
import {
  type AdminAiListSettings,
  GENERATIONS_MAX,
  GENERATIONS_MIN,
  STATE_HINTS,
  STATE_LABELS,
} from '../../../../lib/admin-ai-lists';
import { type AiListSettingsState, saveAiListSettingsAction } from './actions';

/**
 * MEM-143: the block « Générer avec l'IA » of Console › Paramètres: its
 * state, the switch for everyone and the generations per user and per day
 * (1 to 200). Apart from the Chat IA: one off leaves the other.
 */
export function AiListSettingsForm({ settings }: { settings: AdminAiListSettings }) {
  const [state, action, pending] = useActionState<AiListSettingsState & { version?: number }, FormData>(
    async (previous, formData) => ({
      ...(await saveAiListSettingsAction(previous, formData)),
      version: (previous.version ?? 0) + 1,
    }),
    {},
  );
  const values = state.values ?? {
    enabled: settings.enabled,
    generationsPerDay: String(settings.generationsPerDay),
  };
  const on = settings.state === 'active';

  return (
    <section className="admin-settings" aria-labelledby="ai-lists-title" id="ai-lists-settings">
      <h2 id="ai-lists-title">Générer avec l’IA</h2>
      <p>
        État :{' '}
        <strong className={on ? 'admin-settings__on' : 'admin-settings__off'} data-state={settings.state}>
          {STATE_LABELS[settings.state]}
        </strong>
      </p>
      <p className="settings__hint">{STATE_HINTS[settings.state]}</p>
      <form key={state.version ?? 0} action={action} className="admin-settings__form" noValidate>
        <label className="admin-settings__check">
          <input type="checkbox" name="enabled" defaultChecked={values.enabled} />
          Activer la génération de cartes pour tous les utilisateurs
        </label>
        <label>
          Générations par utilisateur et par jour
          <input
            name="generationsPerDay"
            type="number"
            inputMode="numeric"
            min={GENERATIONS_MIN}
            max={GENERATIONS_MAX}
            step={1}
            defaultValue={values.generationsPerDay}
            aria-invalid={state.fieldError ? true : undefined}
            aria-describedby={
              state.fieldError ? 'ai-lists-generations-help ai-lists-generations-error' : 'ai-lists-generations-help'
            }
            autoFocus={Boolean(state.fieldError)}
            className="admin-settings__number"
          />
          <span id="ai-lists-generations-help" className="settings__hint">
            De {GENERATIONS_MIN} à {GENERATIONS_MAX}. Indépendant du Chat IA.
          </span>
          {state.fieldError && (
            <span id="ai-lists-generations-error" className="field-error">
              {state.fieldError}
            </span>
          )}
        </label>
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
