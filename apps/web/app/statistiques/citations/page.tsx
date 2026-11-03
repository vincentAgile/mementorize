import type { Metadata } from 'next';
import { SpaceStatistics } from '../space-statistics';

export const metadata: Metadata = { title: 'Mes statistiques · Citations' };

/** MEM-113, MEM-114: the tab Citations of « Mes statistiques », its next review and its progress. */
export default function QuoteStatisticsPage() {
  return <SpaceStatistics type="Quote" />;
}
