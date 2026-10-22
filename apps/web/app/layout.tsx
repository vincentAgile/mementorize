import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// MEM-32: the font of the logo, Outfit 600 (latin), served with the app:
// no call to an external service. Licence: fonts/OFL-Outfit.txt.
const outfit = localFont({
  src: './fonts/outfit-latin-600.woff2',
  weight: '600',
  display: 'swap',
  variable: '--font-logo',
});

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
    <html lang="fr" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
