'use client';

import { useEffect, useRef } from 'react';
import {
  type AiListSettings,
  COUNTS,
  DAILY_LIMIT,
  KINDS,
  PRIVACY,
  remainingText,
  THEME_COUNTER_FROM,
  THEME_MAX,
  THEME_REQUIRED,
  THEMES,
  themeOf,
} from '../../../../lib/ai-lists';
import { LEVELS } from '../../../../lib/catalog';
import { BackToChoice } from '../back-to-choice';

/**
 * MEM-140: the settings of a generation, four groups of one choice each:
 * level (A1 to C2, its name in the tooltip and for screen readers), theme
 * (ten, or a free one), number and kind; then « Générer ». The chips are
 * radio buttons: the arrows move inside a group, Tab from one to the next.
 * « Autre thème… » opens a field and puts the focus in it; Enter there
 * generates. On a phone, the button stays at the bottom of the screen.
 */
export function AiListSettingsForm({
  settings,
  onChange,
  onGenerate,
  remaining,
  pending,
  error,
  backToPreview,
}: {
  settings: AiListSettings;
  onChange: (settings: AiListSettings) => void;
  onGenerate: () => void;
  remaining: number;
  /** Waiting for the first card: the button is off. */
  pending: boolean;
  /** Why the last generation was refused. */
  error: string | null;
  /** The cards proposed are still there: a way back to them. */
  backToPreview: (() => void) | null;
}) {
  const custom = useRef<HTMLInputElement>(null);
  const openedByUser = useRef(false);
  const missingTheme = themeOf(settings) === '';
  const exhausted = remaining <= 0;

  // « Autre thème… » chosen: the focus goes to its field (not when the page opens with it).
  useEffect(() => {
    if (settings.theme === null && openedByUser.current) custom.current?.focus();
    openedByUser.current = false;
  }, [settings.theme]);

  const set = (patch: Partial<AiListSettings>) => onChange({ ...settings, ...patch });

  return (
    <section className="ai-list" aria-labelledby="ai-list-title">
      <BackToChoice />
      <h2 id="ai-list-title" className="add-list__title" tabIndex={-1}>
        Générer avec l’IA
      </h2>
      <p className="add-list__intro">Choisis un niveau et un thème, l’IA te propose des cartes.</p>
      {backToPreview && (
        <p className="ai-list__back-preview">
          <button type="button" className="link-button" onClick={backToPreview}>
            Revenir aux cartes proposées
          </button>
        </p>
      )}
      <form
        className="ai-settings"
        onSubmit={(event) => {
          event.preventDefault();
          if (!missingTheme && !exhausted && !pending) onGenerate();
        }}
      >
        <fieldset className="ai-settings__group">
          <legend>Niveau</legend>
          <div className="ai-settings__chips">
            {LEVELS.map(({ value, label }) => (
              <label key={value} className="ai-chip" title={label}>
                <input
                  type="radio"
                  name="level"
                  value={value}
                  aria-label={label}
                  checked={settings.level === value}
                  onChange={() => set({ level: value })}
                />
                <span aria-hidden="true">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="ai-settings__group">
          <legend>Thème</legend>
          <div className="ai-settings__chips">
            {THEMES.map((theme) => (
              <label key={theme} className="ai-chip">
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={settings.theme === theme}
                  onChange={() => set({ theme })}
                />
                <span>{theme}</span>
              </label>
            ))}
            <label className="ai-chip">
              <input
                type="radio"
                name="theme"
                value=""
                checked={settings.theme === null}
                onChange={() => {
                  openedByUser.current = true;
                  set({ theme: null });
                }}
              />
              <span>Autre thème…</span>
            </label>
          </div>
          {settings.theme === null && (
            <div className="ai-settings__custom">
              <label htmlFor="ai-custom-theme" className="visually-hidden">
                Ton thème
              </label>
              <input
                ref={custom}
                id="ai-custom-theme"
                type="text"
                value={settings.customTheme}
                maxLength={THEME_MAX}
                placeholder="Ex. : le football, négocier un contrat…"
                autoComplete="off"
                aria-invalid={missingTheme || undefined}
                aria-describedby="ai-custom-theme-help"
                onChange={(event) => set({ customTheme: event.target.value.slice(0, THEME_MAX) })}
              />
              <p id="ai-custom-theme-help" className="ai-settings__help">
                {missingTheme && <span className="field-error">{THEME_REQUIRED}</span>}
                {settings.customTheme.length > THEME_COUNTER_FROM && (
                  <span className="ai-settings__counter">
                    {settings.customTheme.length} / {THEME_MAX}
                  </span>
                )}
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="ai-settings__group">
          <legend>Nombre</legend>
          <div className="ai-settings__chips">
            {COUNTS.map((count) => (
              <label key={count} className="ai-chip">
                <input
                  type="radio"
                  name="count"
                  value={count}
                  aria-label={`${count} cartes`}
                  checked={settings.count === count}
                  onChange={() => set({ count })}
                />
                <span aria-hidden="true">{count}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="ai-settings__group ai-settings__kinds">
          <legend>Type</legend>
          {KINDS.map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name="kind"
                value={value}
                checked={settings.kind === value}
                onChange={() => set({ kind: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ai-settings__bar">
          <button
            type="submit"
            disabled={missingTheme || exhausted || pending}
            aria-describedby={missingTheme ? 'ai-custom-theme-help ai-settings-remaining' : 'ai-settings-remaining'}
          >
            {pending ? 'Génération…' : 'Générer'}
          </button>
          <p id="ai-settings-remaining" className="ai-settings__remaining">
            {exhausted ? DAILY_LIMIT : remainingText(remaining)}
          </p>
        </div>
        <p className="ai-settings__privacy">{PRIVACY}</p>
      </form>
    </section>
  );
}
