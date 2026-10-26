'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Utilisateurs' },
  { href: '/admin/parametres', label: 'Paramètres' },
];

/** MEM-88: the pages of the console, in its band. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Console">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
