import type { Metadata } from 'next';
import { getOptimization, getPreferences } from '../../../lib/api';
import { visibleTypes } from '../../../lib/spaces';
import { mindMapsEnabledOf } from '../../../lib/types';
import { OptimizationForm } from '../optimization-form';
import { RetentionForm } from '../retention-form';
import { UsageModeForm } from '../usage-mode-form';

export const metadata: Metadata = { title: 'Avancé · Réglages' };

// Tab "Avancé" of the Settings, the last one: the mode of use (MEM-110), the
// target retention of each space (MEM-75) and the optimization of its FSRS
// weights on the user's history (MEM-76).
export default async function AdvancedSettingsPage() {
  const [preferences, optimization] = await Promise.all([getPreferences(), getOptimization()]);
  // Cartes mentales only when the space is on (« Espace cartes mentales »).
  const types = visibleTypes(mindMapsEnabledOf(preferences));
  return (
    <>
      {/* Standard while the API doesn't send it yet (a few seconds during a deployment). */}
      <UsageModeForm usageMode={preferences.usageMode ?? 'Standard'} />
      <RetentionForm
        retentions={{
          Vocabulary: preferences.vocabularyRetention,
          Quote: preferences.quoteRetention,
          MindMap: preferences.mindMapRetention,
        }}
        types={types}
      />
      <OptimizationForm spaces={optimization} types={types} />
    </>
  );
}
