import type { Metadata } from 'next';
import { getAdministrator, getAiListSettings, getChatSettings } from '../../../../lib/admin-api';
import { AiListSettingsForm } from './ai-list-settings';
import { ChatSettingsForm } from './chat-settings';
import { TwoFactorSettings } from './two-factor-settings';

export const metadata: Metadata = { title: 'Paramètres' };

const PARIS = { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' } as const;
const when = (date: string) => new Date(date).toLocaleString('fr-FR', PARIS);

/**
 * MEM-88: the settings of the logged-in administrator: their two-step login.
 * The parameters of the app: the Chat IA (MEM-135) and « Générer avec l'IA »
 * (MEM-143). The layout of the users' Réglages: the same width, each field
 * opposite its label on a computer.
 */
export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ '2fa'?: string }> }) {
  const [administrator, params, chat, aiLists] = await Promise.all([
    getAdministrator(),
    searchParams,
    getChatSettings(),
    getAiListSettings(),
  ]);
  const { enabled, enabledAt, disabledAt } = administrator.twoFactor;
  return (
    <>
      <h1>Paramètres</h1>
      <section className="admin-settings" aria-labelledby="two-factor-title">
        <h2 id="two-factor-title">Double authentification</h2>
        <p>
          État :{' '}
          <strong className={enabled ? 'admin-settings__on' : 'admin-settings__off'}>
            {enabled ? 'Activée' : 'Désactivée'}
          </strong>
          {enabled && enabledAt && <> · activée le {when(enabledAt)}</>}
          {!enabled && disabledAt && <> · désactivée le {when(disabledAt)}</>}
        </p>
        <p className="settings__hint">
          {enabled
            ? 'À chaque connexion, après le mot de passe, la console demande le code de ton application d’authentification.'
            : 'Ton compte n’est protégé que par ton mot de passe.'}
        </p>
        {params['2fa'] === 'desactivee' && !enabled && (
          <p role="status" className="notice">
            La double authentification est désactivée.
          </p>
        )}
        <TwoFactorSettings enabled={enabled} />
      </section>
      <ChatSettingsForm settings={chat} />
      <AiListSettingsForm settings={aiLists} />
    </>
  );
}
