import type { Metadata } from 'next';
import { getPreferences } from '../../lib/api';
import { learningModeOf, mindMapsEnabledOf } from '../../lib/types';
import { HomeSpaceForm } from './home-space-form';
import { LearningModeForm } from './learning-mode-form';
import { MindMapsForm } from './mind-maps-form';
import { UsageModeForm } from './usage-mode-form';

export const metadata: Metadata = { title: 'Général · Réglages' };

// Tab "Général" of the Settings (MEM-78), the default one: the home page
// (MEM-6), « Espace cartes mentales », the mode of use (MEM-110), the
// learning mode (MEM-125).
export default async function GeneralSettingsPage() {
  const preferences = await getPreferences();
  const { homeSpace, usageMode } = preferences;
  return (
    <>
      <HomeSpaceForm homeSpace={homeSpace} mindMaps={mindMapsEnabledOf(preferences)} />
      <MindMapsForm enabled={mindMapsEnabledOf(preferences)} />
      {/* Standard while the API doesn't send it yet (a few seconds during a deployment). */}
      <UsageModeForm usageMode={usageMode ?? 'Standard'} />
      {/* Guided while the API doesn't send it yet, likewise. */}
      <LearningModeForm learningMode={learningModeOf(preferences)} />
    </>
  );
}
