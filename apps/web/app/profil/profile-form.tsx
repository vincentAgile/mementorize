'use client';

import { useActionState } from 'react';
import { NAME_MAX_LENGTH } from '../../lib/profile';
import type { Profile } from '../../lib/types';
import { saveProfileAction } from './actions';

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, saving] = useActionState(saveProfileAction, {});
  // After an error, the values typed; otherwise the saved ones.
  const values = state.error ? state : { firstName: profile.firstName ?? '', lastName: profile.lastName ?? '' };

  return (
    <section className="settings">
      <h2>Profil</h2>
      <p className="page__subtitle">
        Ton prénom et ton nom servent aux initiales de l’avatar et au menu du compte. Ils sont facultatifs.
      </p>

      {/* The key remounts the form with the saved values after each save. */}
      <form key={`${profile.firstName}|${profile.lastName}`} action={action} className="settings__form">
        <label>
          E-mail
          <input type="email" value={profile.email} readOnly />
        </label>
        <label>
          Prénom
          <input
            name="firstName"
            defaultValue={values.firstName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="given-name"
          />
        </label>
        <label>
          Nom
          <input
            name="lastName"
            defaultValue={values.lastName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="family-name"
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
