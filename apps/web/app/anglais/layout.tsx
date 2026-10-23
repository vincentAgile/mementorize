import { AppHeader } from '../app-header';

/**
 * The Anglais space in tabs (v0.4, MEM-24): Apprendre · Réviser
 * (/anglais), Liste (/anglais/liste), Ajouter (/anglais/ajouter) and
 * Import / export (/anglais/import-export, MEM-52), each at its own URL. The tabs are in the header's second band (SubNav, MEM-29);
 * the header stays in place from one tab to the next, only the content
 * below it changes.
 */
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page">
        {/* MEM-28: the active menu entry says where we are; the h1 is for screen readers. */}
        <h1 className="visually-hidden page__sr-title">Anglais</h1>
        {children}
      </main>
    </>
  );
}
