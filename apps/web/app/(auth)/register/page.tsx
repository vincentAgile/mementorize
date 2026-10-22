import type { Metadata } from 'next';
import { registerAction } from '../actions';
import { AuthForm } from '../auth-form';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function RegisterPage() {
  return (
    <main className="page page--narrow">
      <h1>Créer un compte</h1>
      <AuthForm mode="register" action={registerAction} />
    </main>
  );
}
