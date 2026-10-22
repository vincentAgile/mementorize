import type { Metadata } from 'next';
import { getPreferences, getReminderSettings } from '../../lib/api';
import { AppHeader } from '../app-header';
import { HomeSpaceForm } from './home-space-form';
import { ReminderForm } from './reminder-form';

export const metadata: Metadata = { title: 'Réglages' };

export default async function SettingsPage() {
  const [preferences, settings] = await Promise.all([getPreferences(), getReminderSettings()]);

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden">Réglages</h1>
        <HomeSpaceForm homeSpace={preferences.homeSpace} />
        <ReminderForm settings={settings} />
      </main>
    </>
  );
}
