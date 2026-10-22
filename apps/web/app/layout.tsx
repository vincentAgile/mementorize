import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // MEM-28: each page names itself, e.g. « Liste · Anglais · Mementorize ».
  title: { default: 'Mementorize', template: '%s · Mementorize' },
  description: 'Mémorisation à long terme par répétition espacée.',
};

// MEM-30: the page may extend under a phone's rounded corners and notch;
// the bar at the bottom keeps clear of them with env(safe-area-inset-bottom).
export const viewport: Viewport = { viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
