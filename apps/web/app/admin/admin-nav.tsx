'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Utilisateurs' },
  { href: '/admin/catalogue', label: 'Catalogue' }, // MEM-116
  { href: '/admin/consommation', label: 'Consommation IA' }, // MEM-143
  { href: '/admin/parametres', label: 'Paramètres' },
];

/** The page is this entry, or one of its pages (a list of the catalogue); the home page only itself. */
const current = (pathname: string, href: string) =>
  pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));

/** MEM-88: the pages of the console, in its band. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Console">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : current(pathname, link.href) ? 'true' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
