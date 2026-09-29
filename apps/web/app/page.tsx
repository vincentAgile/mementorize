import { getCurrentUser, getQuotes } from '../lib/api';
import { logoutAction } from './(auth)/actions';
import { QuoteForm } from './quotes/quote-form';

// Server Component: the data is fetched on the Next.js server (with the
// session's token), and the browser receives ready-made HTML.
export default async function HomePage() {
  const [user, quotes] = await Promise.all([getCurrentUser(), getQuotes()]);

  return (
    <main className="page">
      <header className="page__header">
        <h1>Mementorize</h1>
        <form action={logoutAction} className="page__user">
          <span>{user.email}</span>
          <button type="submit" className="link-button">
            Se déconnecter
          </button>
        </form>
      </header>

      <QuoteForm />

      {quotes.length === 0 ? (
        <p>Aucune citation pour le moment.</p>
      ) : (
        <ul className="quotes__list">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <blockquote>{quote.text}</blockquote>
              {quote.author && <cite>— {quote.author}</cite>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
