import type { Metadata } from 'next';
import { getPreferences } from '../../lib/api';
import { HomeSpaceForm } from './home-space-form';

export const metadata: Metadata = { title: 'Général · Réglages' };

// Tab "Général" of the Settings (MEM-78), the default one: the home page (MEM-6).
export default async function GeneralSettingsPage() {
  const { homeSpace } = await getPreferences();
  return <HomeSpaceForm homeSpace={homeSpace} />;
}
