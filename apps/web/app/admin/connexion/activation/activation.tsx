'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { type AdminCodeState, adminActivateAction } from '../../actions';

interface Key {
  email: string;
  secret: string;
  /** The QR code, as SVG, made on the server from the otpauth address. */
  qrCode: string;
}

/** « JBSW Y3DP EHPK 3PXP… »: the key in groups of 4, easier to type. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

/**
 * MEM-86: the activation of the two-step login. First the key and a code
 * to confirm it; then, once, the 10 recovery codes, to copy or download.
 */
export function Activation({ enrollment }: { enrollment: Key | null }) {
  const [state, formAction, pending] = useActionState<AdminCodeState, FormData>(adminActivateAction, {});

  if (state.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} />;
  if (!enrollment) {
    return (
      <p>
        La double authentification de ce compte est déjà active. <Link href="/admin">Aller à la console</Link>
      </p>
    );
  }
  return (
    <>
      <p>
        La double authentification est obligatoire pour la console. Ajoutez ce compte dans votre application
        d’authentification (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…), puis saisissez le
        code qu’elle affiche.
      </p>
      <ol className="admin-activation__steps">
        <li>
          Scannez ce QR code avec l’application :
          <div
            className="admin-activation__qr"
            role="img"
            aria-label={`QR code du compte ${enrollment.email}`}
            // Made on the server by the qrcode library, from our own otpauth address.
            dangerouslySetInnerHTML={{ __html: enrollment.qrCode }}
          />
        </li>
        <li>
          Ou saisissez la clé à la main :<code className="admin-activation__secret">{grouped(enrollment.secret)}</code>
        </li>
      </ol>
      <form action={formAction} className="auth-form">
        <label>
          Code affiché par l’application
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\s*\d{3}\s?\d{3}\s*"
            maxLength={8}
            className="admin-code__input"
            required
          />
        </label>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error} {state.expired && <Link href="/admin/connexion">Revenir à la connexion</Link>}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Un instant…' : 'Activer'}
        </button>
      </form>
    </>
  );
}

/** The 10 recovery codes, shown this once only. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Mementorize · Console d’administration\nCodes de secours (chacun ne sert qu’une fois) :\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mementorize-codes-de-secours.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-recovery" aria-labelledby="recovery-title">
      <p className="notice">La double authentification est active.</p>
      <h2 id="recovery-title">Vos codes de secours</h2>
      <p role="alert" className="admin-recovery__warning">
        Notez-les maintenant, dans un endroit sûr : ils ne seront plus jamais affichés. Chacun permet une seule
        connexion si vous n’avez plus votre téléphone.
      </p>
      <ol className="admin-recovery__codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <div className="admin-recovery__actions">
        <button type="button" className="button--secondary" onClick={copy}>
          {copied ? 'Copiés ✓' : 'Copier'}
        </button>
        <button type="button" className="button--secondary" onClick={download}>
          Télécharger
        </button>
        <Link href="/admin" className="admin-recovery__continue">
          J’ai noté mes codes : aller à la console
        </Link>
      </div>
    </section>
  );
}
