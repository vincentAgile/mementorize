import type { Metadata } from 'next';
import { getPreferences, getReminderSettings } from '../../lib/api';
import { AppHeader } from '../app-header';
import { CsvForm } from './csv-form';
import { HomeSpaceForm } from './home-space-form';
import { ReminderForm } from './reminder-form';
import { ReviewForm } from './review-form';
import { TranslatorForm } from './translator-form';

export const metadata: Metadata = { title: 'Réglages' };

export default async function SettingsPage() {
  const [preferences, settings] = await Promise.all([getPreferences(), getReminderSettings()]);

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">Réglages</h1>
        <HomeSpaceForm homeSpace={preferences.homeSpace} />
        <ReviewForm showReviewDelays={preferences.showReviewDelays} />
        <TranslatorForm translator={preferences.translator} />
        <CsvForm csvSeparator={preferences.csvSeparator} />
        <ReminderForm settings={settings} />
      </main>
    </>
  );
}
