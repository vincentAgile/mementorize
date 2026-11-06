import type { Metadata } from 'next';
import { getPreferences } from '../../../lib/api';
import { ReviewForm } from '../review-form';

export const metadata: Metadata = { title: 'Révision · Réglages' };

// Tab "Révision" of the Settings (MEM-78): the delays on the rating buttons
// (MEM-49). The target retention (MEM-75) and the optimization (MEM-76) are
// in the tab Avancé.
export default async function ReviewSettingsPage() {
  const preferences = await getPreferences();
  return <ReviewForm showReviewDelays={preferences.showReviewDelays} />;
}
