import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mementorize',
  description: 'Mémorisation à long terme par répétition espacée.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
