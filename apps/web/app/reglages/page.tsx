import type { Metadata } from 'next';
import { getPreferences } from '../../lib/api';
import { learningModeOf, mindMapsEnabledOf } from '../../lib/types';
import { HomeSpaceForm } from './home-space-form';
import { LearningModeForm } from './learning-mode-form';
import { MindMapsForm } from './mind-maps-form';

export const metadata: Metadata = { title: 'Général · Réglages' };

// Tab "Général" of the Settings (MEM-78), the default one: the home page
// (MEM-6), « Espace cartes mentales », the learning mode (MEM-125). The mode
// of use (MEM-110) is in the tab Avancé.
export default async function GeneralSettingsPage() {
  const preferences = await getPreferences();
  const { homeSpace } = preferences;
  return (
    <>
      <HomeSpaceForm homeSpace={homeSpace} mindMaps={mindMapsEnabledOf(preferences)} />
      <MindMapsForm enabled={mindMapsEnabledOf(preferences)} />
      {/* Guided while the API doesn't send it yet, likewise. */}
      <LearningModeForm learningMode={learningModeOf(preferences)} />
    </>
  );
}
