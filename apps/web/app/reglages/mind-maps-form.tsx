'use client';

import { saveMindMapsEnabledAction } from './actions';
import { AutoSelect } from './auto-save';

type Choice = 'Disabled' | 'Enabled';

/**
 * « Espace cartes mentales »: Désactivé by default, Activé. Off, everything
 * about the space is hidden (menus, pages, settings, reminder e-mail); the
 * mind maps are kept. Saved at the selection (MEM-79).
 */
export function MindMapsForm({ enabled }: { enabled: boolean }) {
  return (
    <section className="settings">
      <h2>Espace cartes mentales</h2>
      <p className="page__subtitle">
        « Désactivé », l’espace Cartes mentales est masqué : menus, réglages et e-mail de rappel. Tes cartes mentales
        sont conservées et réapparaissent à l’activation.
      </p>
      <div className="settings__form">
        <AutoSelect<Choice>
          label="Espace cartes mentales"
          name="mindMapsEnabled"
          initial={enabled ? 'Enabled' : 'Disabled'}
          options={[
            { value: 'Disabled', label: 'Désactivé' },
            { value: 'Enabled', label: 'Activé' },
          ]}
          save={(choice) => saveMindMapsEnabledAction(choice === 'Enabled')}
        />
      </div>
    </section>
  );
}
