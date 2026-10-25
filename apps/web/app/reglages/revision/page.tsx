import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { ReviewForm } from '../review-form';

export const metadata: Metadata = { title: 'Révision · Réglages' };

// Tab "Révision" of the Settings (MEM-78): the delays on the rating buttons (MEM-49).
export default async function ReviewSettingsPage() {
  const { showReviewDelays } = await getPreferences();
  return <ReviewForm showReviewDelays={showReviewDelays} />;
}
