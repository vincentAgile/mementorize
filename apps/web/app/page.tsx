import { QuotesManager } from './quotes/quotes-manager';

export default function HomePage() {
  return (
    <main className="page">
      <h1>Mementorize</h1>
      <p className="page__subtitle">
        Phase 2 — interface minimale connectée à l&apos;API des quotes.
      </p>
      <QuotesManager />
    </main>
  );
}
