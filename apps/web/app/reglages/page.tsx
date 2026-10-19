import { getCurrentUser, getDueReviews, getReminderSettings } from '../../lib/api';
import { AppHeader } from '../app-header';
import { ReminderForm } from './reminder-form';

export default async function SettingsPage() {
  const [user, due, settings] = await Promise.all([getCurrentUser(), getDueReviews(1), getReminderSettings()]);

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />
      <ReminderForm settings={settings} />
    </main>
  );
}
