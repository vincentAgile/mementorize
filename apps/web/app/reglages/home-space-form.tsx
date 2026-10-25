'use client';

import { SPACES } from '../../lib/spaces';
import type { ItemType } from '../../lib/types';
import { saveHomeSpaceAction } from './actions';
import { AutoSelect } from './auto-save';

/** Choice of the subject space opened on arrival (MEM-6), saved at the selection (MEM-79). */
export function HomeSpaceForm({ homeSpace }: { homeSpace: ItemType }) {
  return (
    <section className="settings">
      <h2>Page d’accueil</h2>
      <p className="page__subtitle">
        L’espace qui s’ouvre quand tu arrives sur Mementorize, après la connexion et depuis l’e-mail de rappel.
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Ouvrir sur"
          name="homeSpace"
          initial={homeSpace}
          options={SPACES.map((space) => ({ value: space.type, label: space.label }))}
          save={saveHomeSpaceAction}
        />
      </div>
    </section>
  );
}
