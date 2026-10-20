'use client';

import { useActionState } from 'react';
import type { Profile } from '../../lib/types';
import { NAME_MAX_LENGTH } from '../../lib/profile';
import { saveProfileAction } from './actions';

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, saving] = useActionState(saveProfileAction, {});

  return (
    <section className="settings">
      <h2>Profil</h2>
      <p className="page__subtitle">Ton nom sert aux initiales de l’avatar et au menu du compte. Il est facultatif.</p>

      {/* The key remounts the form with the saved name after each save. */}
      <form key={profile.name ?? ''} action={action} className="settings__form">
        <label>
          E-mail
          <input type="email" value={profile.email} readOnly />
        </label>
        <label>
          Nom
          <input
            name="name"
            defaultValue={state.error ? state.name : (profile.name ?? '')}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="name"
            placeholder="Prénom Nom"
          />
        </label>

        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.message && <p className="notice">{state.message}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </section>
  );
}
