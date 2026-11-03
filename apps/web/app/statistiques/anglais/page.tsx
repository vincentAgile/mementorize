import type { Metadata } from 'next';
import { SpaceStatistics } from '../space-statistics';

export const metadata: Metadata = { title: 'Mes statistiques · Anglais' };

/** MEM-113, MEM-114: the tab Anglais of « Mes statistiques », its next review and its progress. */
export default function VocabularyStatisticsPage() {
  return <SpaceStatistics type="Vocabulary" />;
}
