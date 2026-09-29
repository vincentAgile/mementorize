import { getCurrentUser, getDueReviews, getQuotes } from '../lib/api';
import { formatDelay } from '../lib/format';
import type { Quote } from '../lib/types';
import { AppHeader } from './app-header';
import { QuoteForm } from './quotes/quote-form';

// Server Component: the data is fetched on the Next.js server (with the
// session's token), and the browser receives ready-made HTML.
export default async function HomePage() {
  const [user, quotes, due] = await Promise.all([getCurrentUser(), getQuotes(), getDueReviews(1)]);
  const now = new Date();

  return (
    <main className="page">
      <AppHeader email={user.email} dueCount={due.total} />

      <QuoteForm />

      {quotes.length === 0 ? (
        <p>Aucune citation pour le moment.</p>
      ) : (
        <ul className="quotes__list">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <blockquote>{quote.text}</blockquote>
              {quote.author && <cite>— {quote.author}</cite>}
              <p className="quotes__schedule">{scheduleLabel(quote, now)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function scheduleLabel(quote: Quote, now: Date): string {
  if (!quote.card) return '';
  const due = new Date(quote.card.due);
  if (due <= now) return quote.card.state === 'New' ? 'Nouvelle · à réviser' : 'À réviser';
  return `Prochaine révision dans ${formatDelay(now, due)}`;
}
