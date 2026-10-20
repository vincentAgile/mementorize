import { getCurrentUser } from '../../lib/api';
import { AppHeader } from '../app-header';

// The profile, opened from the account menu (MEM-10). For now it only shows
// the e-mail of the account; the name can be filled in with MEM-11.
export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <main className="page">
      <AppHeader email={user.email} />
      <section className="settings">
        <h2>Profil</h2>
        <form className="settings__form">
          <label>
            E-mail
            <input type="email" value={user.email} readOnly />
          </label>
        </form>
      </section>
    </main>
  );
}
