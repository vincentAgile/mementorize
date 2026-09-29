import { registerAction } from '../actions';
import { AuthForm } from '../auth-form';

export default function RegisterPage() {
  return (
    <main className="page page--narrow">
      <h1>Créer un compte</h1>
      <AuthForm mode="register" action={registerAction} />
    </main>
  );
}
