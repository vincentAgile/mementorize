import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Import / export · Citations' };

// Tab "Import / export" of the Citations space (MEM-66).
export default function QuotesImportExportPage() {
  return (
    <p className="space__empty">
      L’import et l’export des citations en CSV arrivent bientôt. <Link href="/citations/liste">Voir la liste</Link>
    </p>
  );
}
