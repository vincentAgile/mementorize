import { getProfile } from '../../lib/api';
import { AppHeader } from '../app-header';
import { ProfileForm } from './profile-form';

// The profile, opened from the account menu (MEM-10): the e-mail of the
// account, read only, and the name, optional (MEM-11).
export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <main className="page">
      <AppHeader />
      <ProfileForm profile={profile} />
    </main>
  );
}
