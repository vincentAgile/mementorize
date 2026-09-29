import { loginAction } from '../actions';
import { AuthForm } from '../auth-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <main className="page page--narrow">
      <h1>Connexion</h1>
      {expired && <p className="notice">Ta session a expiré, reconnecte-toi.</p>}
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
