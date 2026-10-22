import type { Metadata } from 'next';
import { getProfile } from '../../lib/api';
import { AppHeader } from '../app-header';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profil' };

// The profile, opened from the account menu (MEM-10): the e-mail of the
// account, read only, and the name, optional (MEM-11).
export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden">Profil</h1>
        <ProfileForm profile={profile} />
      </main>
    </>
  );
}
