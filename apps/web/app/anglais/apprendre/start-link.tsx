'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * MEM-127: « Commencer », the main action of the page, focused when it
 * opens. Enter starts it, as any link; Space too, as a button would.
 */
export function StartLink({ href }: { href: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => link.current?.focus(), []);
  return (
    <Link
      ref={link}
      href={href}
      className="space__review learning-intro__start"
      onKeyDown={(event) => {
        if (event.key !== ' ') return;
        event.preventDefault();
        event.currentTarget.click();
      }}
    >
      Commencer
    </Link>
  );
}
