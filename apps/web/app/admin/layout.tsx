import type { Metadata } from 'next';

// MEM-82: the administration console, apart from the users' app: its own
// layout (no header of the spaces, no settings, no account menu), never
// indexed, never cached.
export const metadata: Metadata = {
  title: { default: 'Console d’administration', template: '%s · Console d’administration' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
