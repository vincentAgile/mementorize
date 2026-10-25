import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminStep } from '../../../../lib/admin-session';
import { AdminBanner } from '../../admin-banner';
import { CodeForm } from './code-form';

export const metadata: Metadata = { title: 'Code de vérification' };

/** MEM-86: the second step of the login, after the password. */
export default async function AdminCodePage() {
  if (!(await getAdminStep())) redirect('/admin/connexion?etape=expiree');
  return (
    <>
      <AdminBanner />
      <main className="admin__main admin__main--narrow">
        <h1>Code de vérification</h1>
        <p>Saisissez le code à 6 chiffres affiché par votre application d’authentification.</p>
        <CodeForm />
      </main>
    </>
  );
}
