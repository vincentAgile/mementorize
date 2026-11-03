import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mes statistiques · Citations' };

/** MEM-113: the tab Citations of « Mes statistiques »; its progress comes with MEM-114. */
export default function QuoteStatisticsPage() {
  return (
    <section className="statistics">
      <h2>Citations</h2>
    </section>
  );
}
