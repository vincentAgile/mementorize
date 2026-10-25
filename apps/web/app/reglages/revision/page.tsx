import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { RetentionForm } from '../retention-form';
import { ReviewForm } from '../review-form';

export const metadata: Metadata = { title: 'Révision · Réglages' };

// Tab "Révision" of the Settings (MEM-78): the delays on the rating buttons
// (MEM-49) and the target retention of each space (MEM-75).
export default async function ReviewSettingsPage() {
  const preferences = await getPreferences();
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
    </>
  );
}
