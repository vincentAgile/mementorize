import { AppHeader } from '../app-header';

/**
 * The Settings in tabs (MEM-78): Général (/reglages), Rappels
 * (/reglages/rappels), Import / export (/reglages/import-export) and Avancé
 * (/reglages/avance), each at its own address.
 * The tabs are in the header's second band (SubNav), under the gear, which
 * joins it on a computer. On a computer, the settings take the whole width
 * of the page's column, as the header.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page page--settings">
        {/* MEM-28: the h1 is for screen readers; on a phone, the name next to the logo (MEM-34). */}
        <h1 className="visually-hidden page__sr-title">Réglages</h1>
        {children}
      </main>
    </>
  );
}
