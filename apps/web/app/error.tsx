'use client';

// Error boundary for the pages below app/: shown instead of a blank page
// when something throws while rendering (typically: the API is down).
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h1>Oups</h1>
      <p>Impossible de charger la page. L&apos;API (et sa base de données) est-elle démarrée ?</p>
      <button type="button" onClick={() => reset()}>
        Réessayer
      </button>
    </main>
  );
}
