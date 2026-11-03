import { AppHeader } from '../app-header';

/**
 * MEM-113: « Mes statistiques », opened from the account menu, in tabs as
 * the Settings (MEM-78): Anglais (/statistiques/anglais) and Citations
 * (/statistiques/citations), each at its own address, in the header's
 * second band (SubNav). Not a space: no entry of the menu is highlighted.
 */
export default function StatisticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        {/* MEM-28: the h1 is for screen readers; on a phone, the name next to the logo (MEM-34). */}
        <h1 className="visually-hidden page__sr-title">Mes statistiques</h1>
        {children}
      </main>
    </>
  );
}
