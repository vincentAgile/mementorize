'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatDelay } from '../../lib/format';
import { pronounce, stopPronouncing } from '../../lib/speech';
import type { LearningItem, LearningSession, ReviewRating } from '../../lib/types';
import { Speakable } from '../speech/speak-button';
import { learnAction } from './actions';

const RATINGS: { rating: ReviewRating; label: string }[] = [
  { rating: 'Again', label: 'À revoir' },
  { rating: 'Hard', label: 'Difficile' },
  { rating: 'Good', label: 'Correct' },
  { rating: 'Easy', label: 'Facile' },
];

type Phase = 'discover' | 'rate' | 'done';

interface LearningSessionViewProps {
  session: LearningSession;
  /** The server's clock, so that the server and the browser show the same delays. */
  now: string;
}

/**
 * A learning session (MEM-21), in two steps over the same items:
 * 1. discovery: the English, then its French translation, without a rating;
 * 2. as in the review: the French → English card, rated with the four
 *    buttons. That rating moves the item to "En cours d'apprentissage".
 * Same shortcuts as the review: Space reveals (and goes on in step 1), 1-4 rate.
 * The items are those loaded with the page: leaving the session keeps the
 * unrated ones "À apprendre".
 */
export function LearningSessionView({ session, now }: LearningSessionViewProps) {
  const [items] = useState(session.items);
  const [phase, setPhase] = useState<Phase>('discover');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [learned, setLearned] = useState<LearningItem[]>([]);
  const [failed, setFailed] = useState(0);
  const [sending, setSending] = useState(false);
  // Set as soon as a rating is sent: two clicks (or keys) in the same frame rate only once.
  const answered = useRef(false);

  const item = items[index];
  const last = index === items.length - 1;

  // Leaving the session stops the reading (MEM-37).
  useEffect(() => stopPronouncing, []);

  // MEM-38: at step 2 the answer is the English, read as it appears. Called
  // in the click or key handler: browsers only allow speech started by the user.
  function reveal() {
    setRevealed(true);
    if (phase === 'rate' && item) pronounce(item.word);
  }

  function goOn() {
    stopPronouncing(); // next card
    if (phase === 'discover') {
      setRevealed(false);
      if (last) {
        setPhase('rate');
        setIndex(0);
      } else {
        setIndex(index + 1);
      }
    }
  }

  async function rate(rating: ReviewRating) {
    if (answered.current || !item) return;
    answered.current = true;
    stopPronouncing();
    setSending(true);
    const ok = await learnAction(item.id, rating);
    if (ok) setLearned((done) => [...done, item]);
    else setFailed((count) => count + 1);
    setSending(false);
    answered.current = false;
    setRevealed(false);
    if (last) setPhase('done');
    else setIndex(index + 1);
  }

  // Keyboard: Space (or Enter) reveals, then goes on in step 1; 1-4 rate in step 2.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || phase === 'done') return;
      if (event.key === ' ' || event.key === 'Enter') {
        // Let a focused button handle Enter/Space itself, once.
        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
        event.preventDefault();
        if (!revealed) reveal();
        else goOn();
      } else if (phase === 'rate' && revealed && ['1', '2', '3', '4'].includes(event.key)) {
        void rate(RATINGS[Number(event.key) - 1].rating);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (phase === 'done') {
    const remaining = session.total - learned.length;
    return (
      <section className="learning-done">
        <h2>Session terminée</h2>
        <p>
          {learned.length === 0
            ? 'Aucun élément n’a pu être enregistré.'
            : `${learned.length} élément${learned.length > 1 ? 's' : ''} passe${learned.length > 1 ? 'nt' : ''} en apprentissage : ${learned.length > 1 ? 'ils entrent' : 'il entre'} en révision.`}
          {failed > 0 && ` ${failed} n’a pas pu être enregistré (déjà appris ou supprimé entre-temps).`}
        </p>
        <ul className="learning-done__list">
          {learned.map((done) => (
            <li key={done.id}>
              <strong lang="en">{done.word}</strong> → {done.translation}
            </li>
          ))}
        </ul>
        <p className="learning-done__links">
          <Link href="/anglais" className="space__review">
            Retour à l’anglais
          </Link>
          {remaining > 0 && (
            // A plain link: the page loads a new session with the next items.
            <a href="/apprendre" className="learning-done__next">
              Apprendre les suivants ({remaining})
            </a>
          )}
        </p>
      </section>
    );
  }

  const discovering = phase === 'discover';
  const step = discovering ? 'Étape 1 · Découverte' : 'Étape 2 · Français → anglais';

  return (
    <section aria-label="Apprentissage">
      <p className="review-progress">
        <strong>{step}</strong> · {index + 1} / {items.length} · <Link href="/anglais">Arrêter</Link>
      </p>
      <ol className="learning-steps" aria-label="Progression">
        {items.map((it, i) => (
          <li key={it.id} className={i < index ? 'is-done' : i === index ? 'is-current' : undefined} />
        ))}
      </ol>

      <article className="review-card">
        <p className="review-card__author">{discovering ? 'Nouvel élément' : 'Français → anglais'}</p>

        {discovering ? (
          <>
            <Speakable text={item.word}>
              <blockquote className="review-card__text" lang="en">
                {item.word}
              </blockquote>
            </Speakable>
            {revealed ? (
              <>
                <p className="review-card__answer">{item.translation}</p>
                {item.example && (
                  <p className="review-card__note" lang="en">
                    {item.example}
                  </p>
                )}
                <button type="button" className="review-card__reveal" onClick={goOn}>
                  {last ? 'Passer à l’étape 2' : 'Suivant'} <kbd>Espace</kbd>
                </button>
              </>
            ) : (
              <>
                <p className="review-card__question">Lis-le, puis découvre sa traduction.</p>
                <button type="button" className="review-card__reveal" onClick={reveal}>
                  Afficher la traduction <kbd>Espace</kbd>
                </button>
              </>
            )}
          </>
        ) : revealed ? (
          <>
            <p className="review-card__recall">{item.translation}</p>
            <Speakable text={item.word}>
              <blockquote className="review-card__text" lang="en">
                {item.word}
              </blockquote>
            </Speakable>
            {item.example && (
              <p className="review-card__note" lang="en">
                {item.example}
              </p>
            )}
            <p className="review-card__question">Tu t&apos;en souvenais bien ?</p>
            <div className="review-card__ratings">
              {RATINGS.map(({ rating, label }, i) => (
                <button
                  key={rating}
                  type="button"
                  className={`rating rating--${rating.toLowerCase()}`}
                  disabled={sending}
                  onClick={() => void rate(rating)}
                >
                  <span className="rating__label">{label}</span>
                  <span className="rating__delay">{formatDelay(new Date(now), new Date(item.nextDue[rating]))}</span>
                  <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <blockquote className="review-card__text review-card__text--cue">{item.translation}</blockquote>
            <p className="review-card__question">Comment le dit-on en anglais ?</p>
            <button type="button" className="review-card__reveal" onClick={reveal}>
              Afficher la réponse <kbd>Espace</kbd>
            </button>
          </>
        )}
      </article>
    </section>
  );
}
