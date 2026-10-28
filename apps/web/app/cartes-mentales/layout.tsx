import { AppHeader } from '../app-header';

/**
 * The Cartes mentales space in tabs (MEM-97), as the other spaces: Réviser
 * (/cartes-mentales), Liste (/cartes-mentales/liste) and Ajouter
 * (/cartes-mentales/ajouter), each at its own URL. The tabs are in the
 * header's second band (SubNav, MEM-29). The editor of a map
 * (/mind-maps/[id]) stays a page of its own, under the tab « Liste ».
 */
export default function MindMapsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="page">
        {/* MEM-28: the active menu entry says where we are; the h1 is for screen readers. */}
        <h1 className="visually-hidden page__sr-title">Cartes mentales</h1>
        {children}
      </main>
    </>
  );
}
