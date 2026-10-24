import { AppHeader } from '../app-header';

/**
 * The Citations space in tabs (MEM-66), as the Anglais space: Apprendre ·
 * Réviser (/citations), Liste (/citations/liste), Ajouter
 * (/citations/ajouter) and Import / export (/citations/import-export), each
 * at its own URL. The tabs are in the header's second band (SubNav, MEM-29).
 */
export default function QuotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page">
        {/* MEM-28: the active menu entry says where we are; the h1 is for screen readers. */}
        <h1 className="visually-hidden page__sr-title">Citations</h1>
        {children}
      </main>
    </>
  );
}
