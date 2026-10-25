import type { Metadata } from 'next';
import { AdminBanner } from '../admin-banner';
import { AdminLoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };

/** The login of the console (MEM-82), with its own accounts: a user account doesn't open it. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expiree?: string; etape?: string }>;
}) {
  const { expiree, etape } = await searchParams;
  return (
    <>
      <AdminBanner />
      <main className="admin__main admin__main--narrow">
        <h1>Connexion</h1>
        {expiree && <p className="notice">La session a expiré : reconnectez-vous.</p>}
        {etape && <p className="notice">L’étape du code a expiré : saisissez de nouveau votre mot de passe.</p>}
        <AdminLoginForm />
      </main>
    </>
  );
}
