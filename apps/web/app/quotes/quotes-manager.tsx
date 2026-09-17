'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createQuote, getQuotes } from '../../lib/api';
import type { Quote } from '../../lib/types';

export function QuotesManager() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadQuotes() {
    try {
      setStatus('loading');
      const data = await getQuotes();
      setQuotes(data);
      setStatus('ready');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  }

  useEffect(() => {
    loadQuotes();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      await createQuote({ text: text.trim(), author: author.trim() || undefined });
      setText('');
      setAuthor('');
      await loadQuotes();
    } catch (error) {
      console.error(error);
      alert("Impossible d'enregistrer la citation. L'API est-elle démarrée ?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="quotes">
      <form onSubmit={handleSubmit} className="quotes__form">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Texte de la citation"
          rows={3}
          required
        />
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Auteur (optionnel)"
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </form>

      {status === 'loading' && <p>Chargement des citations…</p>}
      {status === 'error' && (
        <p role="alert">
          Impossible de contacter l&apos;API. Vérifie qu&apos;elle tourne sur{' '}
          <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}</code>.
        </p>
      )}
      {status === 'ready' && quotes.length === 0 && <p>Aucune citation pour le moment.</p>}

      <ul className="quotes__list">
        {quotes.map((quote) => (
          <li key={quote.id}>
            <blockquote>{quote.text}</blockquote>
            {quote.author && <cite>— {quote.author}</cite>}
          </li>
        ))}
      </ul>
    </div>
  );
}
