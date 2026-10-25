import type { Metadata } from 'next';
import { getReminderSettings } from '../../../lib/api';
import { ReminderForm } from '../reminder-form';

export const metadata: Metadata = { title: 'Rappels · Réglages' };

// Tab "Rappels" of the Settings (MEM-78): the daily reminder e-mail (phase 11).
export default async function ReminderSettingsPage() {
  return <ReminderForm settings={await getReminderSettings()} />;
}
