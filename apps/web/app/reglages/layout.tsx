import { AppHeader } from '../app-header';

/**
 * The Settings in tabs (MEM-78): Général (/reglages), Révision
 * (/reglages/revision), Rappels (/reglages/rappels) and Saisie et fichiers
 * (/reglages/saisie), each at its own address. The tabs are in the header's
 * second band (SubNav), under the gear, which joins it on a computer.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        {/* MEM-28: the h1 is for screen readers; on a phone, the name next to the logo (MEM-34). */}
        <h1 className="visually-hidden page__sr-title">Réglages</h1>
        {children}
      </main>
    </>
  );
}
