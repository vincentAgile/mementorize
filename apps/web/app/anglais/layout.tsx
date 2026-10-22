import { AppHeader } from '../app-header';
import { EnglishTabs } from './english-tabs';

/**
 * The Anglais space in three tabs (v0.4, MEM-24): Apprendre · Réviser
 * (/anglais), Liste (/anglais/liste) and Ajouter (/anglais/ajouter), each
 * at its own URL. The header and the tabs stay in place from one tab to
 * the next; only the content below them changes.
 */
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="page">
      <AppHeader />
      <h2 className="space__title">Anglais</h2>
      <EnglishTabs />
      {children}
    </main>
  );
}
