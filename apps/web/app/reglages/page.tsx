import type { Metadata } from 'next';
import { getPreferences } from '../../lib/api';
import { HomeSpaceForm } from './home-space-form';
import { UsageModeForm } from './usage-mode-form';

export const metadata: Metadata = { title: 'Général · Réglages' };

// Tab "Général" of the Settings (MEM-78), the default one: the home page
// (MEM-6), the mode of use (MEM-110).
export default async function GeneralSettingsPage() {
  const { homeSpace, usageMode } = await getPreferences();
  return (
    <>
      <HomeSpaceForm homeSpace={homeSpace} />
      {/* Standard while the API doesn't send it yet (a few seconds during a deployment). */}
      <UsageModeForm usageMode={usageMode ?? 'Standard'} />
    </>
  );
}
