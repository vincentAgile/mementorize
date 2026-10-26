'use client';

import { useActionState, useRef } from 'react';
import { disableTwoFactorAction, enableTwoFactorAction, type TwoFactorState } from '../../actions';

/**
 * MEM-88: turn the two-step login of the account off (password and a code,
 * in a confirmation) or on again (the password, then the activation).
 */
export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [disableState, disable, disabling] = useActionState<TwoFactorState, FormData>(disableTwoFactorAction, {});
  const [enableState, enable, enabling] = useActionState<TwoFactorState, FormData>(enableTwoFactorAction, {});

  if (!enabled) {
    return (
      <form action={enable} className="admin-settings__form">
        <p>
          Pour l’activer de nouveau, confirmez votre mot de passe ; la console affichera ensuite le QR code à scanner.
        </p>
        <label>
          Mot de passe
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {enableState.error && (
          <p role="alert" className="form-error">
            {enableState.error}
          </p>
        )}
        <button type="submit" className="admin-settings__button" disabled={enabling}>
          {enabling ? 'Un instant…' : 'Activer la double authentification'}
        </button>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        className="admin-settings__button admin-settings__button--danger"
        onClick={() => dialog.current?.showModal()}
      >
        Désactiver la double authentification
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby="disable-2fa-title">
        <h3 id="disable-2fa-title">Désactiver la double authentification ?</h3>
        <p role="note" className="admin-settings__warning">
          Votre compte ne sera plus protégé que par votre mot de passe.
        </p>
        <p className="dialog__hint">
          Pour confirmer, saisissez votre mot de passe et un code de votre application (ou un code de secours). Vos
          codes de secours seront supprimés.
        </p>
        <form action={disable} className="dialog__form">
          <label>
            Mot de passe
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <label>
            Code
            <input
              name="code"
              autoComplete="one-time-code"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={40}
              required
            />
          </label>
          {disableState.error && (
            <p role="alert" className="form-error">
              {disableState.error}
            </p>
          )}
          <div className="dialog__buttons">
            <button type="button" className="button--secondary" onClick={() => dialog.current?.close()}>
              Annuler
            </button>
            <button type="submit" className="button--primary admin-settings__confirm" disabled={disabling}>
              {disabling ? 'Un instant…' : 'Désactiver'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
