import Link from 'next/link';

interface LogoProps {
  /** `mark`: the monogram alone, for very narrow screens (MEM-34). */
  variant?: 'full' | 'mark';
  className?: string;
}

/**
 * The logo (MEM-32): the monogram of the favicon (MEM-13, a white « M » in a
 * green rounded square) is the first letter of the name, followed by
 * « ementorize » in Outfit: [M]ementorize. A link to the home page (MEM-6).
 * Screen readers hear « Mementorize »: the drawing is decorative.
 */
export function Logo({ variant = 'full', className }: LogoProps) {
  return (
    <Link href="/" className={['logo', `logo--${variant}`, className].filter(Boolean).join(' ')}>
      <span className="visually-hidden">Mementorize</span>
      <span className="logo__word" aria-hidden="true">
        <svg className="logo__mark" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="14" fill="#147d80" />
          {/* The « M » of the favicon, 25 % larger (MEM-35): from 14.5 to 49.5. */}
          <path
            transform="translate(32 32) scale(1.25) translate(-32 -32)"
            d="M16 46V18h5l11 15 11-15h5v28h-7V30l-9 12-9-12v16z"
            fill="#fff"
          />
        </svg>
        {variant === 'full' && <span className="logo__rest">ementorize</span>}
      </span>
    </Link>
  );
}
