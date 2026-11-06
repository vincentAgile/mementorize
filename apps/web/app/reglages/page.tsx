import type { Metadata } from 'next';
import { getPreferences } from '../../lib/api';
import { learningModeOf, mindMapsEnabledOf } from '../../lib/types';
import { HomeSpaceForm } from './home-space-form';
import { LearningModeForm } from './learning-mode-form';
import { ReviewForm } from './review-form';
import { TranslatorForm } from './translator-form';

export const metadata: Metadata = { title: 'Général · Réglages' };

// Tab "Général" of the Settings (MEM-78), the default one: the home page
// (MEM-6), the learning mode (MEM-125), the delays on the rating buttons
// (MEM-49) and the translation tools (MEM-44). « Espace cartes mentales » and
// the mode of use (MEM-110) are in the tab Avancé.
export default async function GeneralSettingsPage() {
  const preferences = await getPreferences();
  const { homeSpace } = preferences;
  return (
    <>
      <HomeSpaceForm homeSpace={homeSpace} mindMaps={mindMapsEnabledOf(preferences)} />
      {/* Guided while the API doesn't send it yet (a few seconds during a deployment). */}
      <LearningModeForm learningMode={learningModeOf(preferences)} />
      <ReviewForm showReviewDelays={preferences.showReviewDelays} />
      <TranslatorForm translator={preferences.translator} />
    </>
  );
}
