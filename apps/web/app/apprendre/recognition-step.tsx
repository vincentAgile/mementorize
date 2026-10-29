'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { stopPronouncing } from '../../lib/speech';
import type { LearningItem } from '../../lib/types';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import { Speakable, usePronunciationAudio } from '../speech/speak-button';

interface RecognitionStepProps {
  /** The series, in its order. */
  items: LearningItem[];
  /** After the last item: on to « Évaluation de l'apprentissage ». */
  onDone: () => void;
}

/**
 * MEM-100 (adjustment): step 2 of the learning, between the listening and
 * the evaluation. Each item of the series as an English → French card: the
 * English, written for the first time (with its loudspeaker button, P),
 * then « Afficher la réponse » shows the French and the examples, and the
 * same button, at the same place, goes on to the next item, or to the
 * evaluation after the last one. No heading and no question on the card. No
 * rating: nothing is sent to the API, no state changes. Shortcut: Space (or
 * Enter) reveals, then goes on.
 */
export function RecognitionStep({ items, onDone }: RecognitionStepProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = items[index];
  const last = index === items.length - 1;
  const audioUrl = pronunciationUrl(item.id, item.word);
  usePronunciationAudio(audioUrl);

  function goOn() {
    stopPronouncing();
    if (last) return onDone();
    setRevealed(false);
    setIndex(index + 1);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      // A focused button or link handles Enter/Space itself, once.
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (revealed) goOn();
      else setRevealed(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <section aria-label="Anglais → français">
      <p className="review-progress">
        <strong>Étape 2 · Anglais → français</strong> ·{' '}
        <span aria-label={`Élément ${index + 1} sur ${items.length}`}>
          {index + 1} / {items.length}
        </span>{' '}
        · <Link href="/anglais">Arrêter</Link>
      </p>
      <ol className="learning-steps" aria-hidden="true">
        {items.map((it, i) => (
          <li key={it.id} className={i === index ? 'is-current' : i < index ? 'is-done' : undefined} />
        ))}
      </ol>

      <article className="review-card" key={item.id}>
        <Speakable text={item.word} audioUrl={audioUrl}>
          <blockquote className="review-card__text" lang="en">
            {item.word}
          </blockquote>
        </Speakable>
        {/* The answer keeps its room while hidden: the button below stays where it is (MEM-100). */}
        <div
          className={revealed ? undefined : 'review-card__face--ghost'}
          aria-hidden={revealed ? undefined : true}
          inert={!revealed}
        >
          <p className="recognition__answer" lang="fr">
            {item.translation}
          </p>
          {item.example && (
            <p className="review-card__note" lang="en">
              {item.example}
            </p>
          )}
          {item.frenchExample && (
            <p className="review-card__note review-card__note--fr" lang="fr">
              {item.frenchExample}
            </p>
          )}
        </div>
        <p className="review-card__reveal-row">
          {revealed ? (
            <button type="button" className="review-card__reveal" onClick={goOn}>
              {last ? 'Passer à l’évaluation' : 'Élément suivant'} <kbd>Espace</kbd>
            </button>
          ) : (
            <button type="button" className="review-card__reveal" onClick={() => setRevealed(true)}>
              Afficher la réponse <kbd>Espace</kbd>
            </button>
          )}
        </p>
      </article>
    </section>
  );
}
