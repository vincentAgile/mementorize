import type { Metadata } from 'next';
import { getOptimization, getPreferences } from '../../../lib/api';
import { OptimizationForm } from '../optimization-form';
import { RetentionForm } from '../retention-form';
import { ReviewForm } from '../review-form';

export const metadata: Metadata = { title: 'Révision · Réglages' };

// Tab "Révision" of the Settings (MEM-78): the delays on the rating buttons
// (MEM-49), the target retention of each space (MEM-75) and the optimization
// of its FSRS weights on the user's history (MEM-76).
export default async function ReviewSettingsPage() {
  const [preferences, optimization] = await Promise.all([getPreferences(), getOptimization()]);
  return (
    <>
      <ReviewForm showReviewDelays={preferences.showReviewDelays} />
      <RetentionForm
        retentions={{
          Vocabulary: preferences.vocabularyRetention,
          Quote: preferences.quoteRetention,
          MindMap: preferences.mindMapRetention,
        }}
      />
      <OptimizationForm spaces={optimization} />
    </>
  );
}
