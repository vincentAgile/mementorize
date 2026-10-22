import type { Metadata } from 'next';
import { loginAction } from '../actions';
import { Logo } from '../../logo';
import { AuthForm } from '../auth-form';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;

  return (
    <main className="page page--narrow">
      <Logo className="auth__logo" />
      <h1>Connexion</h1>
      {expired && <p className="notice">Ta session a expiré, reconnecte-toi.</p>}
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
