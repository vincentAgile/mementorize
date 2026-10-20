import { getCurrentUser, getReminderSettings } from '../../lib/api';
import { AppHeader } from '../app-header';
import { ReminderForm } from './reminder-form';

export default async function SettingsPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getReminderSettings()]);

  return (
    <main className="page">
      <AppHeader email={user.email} />
      <ReminderForm settings={settings} />
    </main>
  );
}
