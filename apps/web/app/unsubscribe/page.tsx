import { UnsubscribeForm } from './unsubscribe-form';

// Opened from a reminder e-mail, without a session. The click on the button
// is what unsubscribes: some mail services open the links of an e-mail by
// themselves (to scan them), and that alone mustn't turn the reminders off.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; token?: string }>;
}) {
  const { user, token } = await searchParams;

  return (
    <main className="page page--narrow">
      <h1>Rappels par e-mail</h1>
      {user && token ? (
        <UnsubscribeForm user={user} token={token} />
      ) : (
        <p className="form-error">Ce lien de désinscription est incomplet.</p>
      )}
    </main>
  );
}
