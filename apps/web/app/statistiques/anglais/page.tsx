import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mes statistiques · Anglais' };

/** MEM-113: the tab Anglais of « Mes statistiques »; its progress comes with MEM-114. */
export default function VocabularyStatisticsPage() {
  return (
    <section className="statistics">
      <h2>Anglais</h2>
    </section>
  );
}
