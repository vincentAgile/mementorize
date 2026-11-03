import { redirect } from 'next/navigation';
import { STATISTICS_TABS } from '../../lib/statistics';

/** MEM-113: « Mes statistiques » opens on its first tab, Anglais. */
export default function StatisticsPage() {
  redirect(STATISTICS_TABS[0].href);
}
