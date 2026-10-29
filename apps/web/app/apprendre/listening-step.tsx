'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { stopPronouncing } from '../../lib/speech';
import type { LearningItem } from '../../lib/types';
import { pronunciationUrl } from '../../lib/pronunciation-url';
import { usePronunciationAudio } from '../speech/speak-button';
import { ListeningItem } from './listening-item';

interface ListeningStepProps {
  /** The series chosen on the preparation page (10 items at most, MEM-94), in its order. */
  items: LearningItem[];
  /** The pronunciation assessment is configured on the server (MEM-90). */
  canAssess: boolean;
  /** After the last item: on to « Évaluation de l'apprentissage ». */
  onDone: () => void;
}

/**
 * MEM-102: the step « Écoute et prononciation », over the whole series, at
 * the user's pace: one item at a time (MEM-101), « 3 / 10 », and at the
 * bottom of the page the button to the next item, or to the evaluation
 * after the last one. Shortcut: Space (or Enter). Going on changes no state:
 * nothing is sent to the API during this step.
 */
export function ListeningStep({ items, canAssess, onDone }: ListeningStepProps) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  const last = index === items.length - 1;
  const audioUrl = pronunciationUrl(item.id, item.word);

  // The audio of this item and of the next one, loaded in advance (MEM-39).
  const next = items[index + 1];
  usePronunciationAudio(audioUrl);
  usePronunciationAudio(next && pronunciationUrl(next.id, next.word));

  function goOn() {
    stopPronouncing();
    if (last) onDone();
    else setIndex(index + 1);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      // A focused button or link handles Enter/Space itself, once.
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      goOn();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <section aria-label="Écoute et prononciation">
      <p className="review-progress">
        <strong>Étape 1 · Écoute et prononciation</strong> ·{' '}
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

      <ListeningItem key={item.id} item={item} audioUrl={audioUrl} canAssess={canAssess} />

      <p className="listening__next">
        <button type="button" className="review-card__reveal" onClick={goOn}>
          {last ? 'Passer à l’évaluation' : 'Élément suivant'} <kbd>Espace</kbd>
        </button>
      </p>
    </section>
  );
}
