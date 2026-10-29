'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stopPronouncing } from '../../lib/speech';
import type { LearningItem, LearningSession } from '../../lib/types';
import type { Answer } from '../review/rating-buttons';
import { LearningEvaluation } from './learning-evaluation';
import { ListeningStep } from './listening-step';
import { sendAnswers } from './send-answers';

type Phase = 'listen' | 'evaluate' | 'saving' | 'done';

interface LearningSessionViewProps {
  session: LearningSession;
  /** The server's clock, so that the server and the browser show the same delays. */
  now: string;
  /** The delays under the rating buttons: a setting, off by default (MEM-49). */
  showDelays: boolean;
  /** MEM-91: the pronunciation assessment is configured on the server. */
  canAssess?: boolean;
}

/**
 * A learning session (MEM-21), in two steps over the whole series:
 * 1. « Écoute et prononciation » (MEM-101, MEM-102): one item after the
 *    other, its English read at once, with its translation, « Réécouter »
 *    and « Évaluer ma prononciation »; no rating, no state changed;
 * 2. « Évaluation de l'apprentissage » (MEM-103), as in the review: the
 *    French → English card, rated with the four buttons; « À revoir » puts
 *    the item back in the series (MEM-47). A rating moves the item to "En
 *    cours d'apprentissage"; « Appris » straight to "Appris", out of the
 *    review (MEM-46).
 * The step 1 leads straight to step 2, on the same page (MEM-104).
 * MEM-104: the answers of an item are sent as soon as it is through step 2
 * (its last answer is not « À revoir »), in their order: the first one moves
 * it to "En cours d'apprentissage" (or "Appris"), the next ones are reviews
 * of its card. Leaving the session ("Arrêter", another page) keeps those;
 * the others, not answered yet or waiting after « À revoir », stay in their
 * state ("À apprendre"). Leaving during step 1 changes nothing.
 */
export function LearningSessionView({ session, now, showDelays, canAssess = false }: LearningSessionViewProps) {
  const [items] = useState(session.items);
  const [phase, setPhase] = useState<Phase>('listen');
  // The answers being sent, one item after the other, in the order they got through.
  const sending = useRef<Promise<void>>(Promise.resolve());
  const [learned, setLearned] = useState<LearningItem[]>([]); // now in the review
  const [known, setKnown] = useState<LearningItem[]>([]); // « Appris »: out of the review
  const [failed, setFailed] = useState(0);

  // Leaving the session stops the reading (MEM-37).
  useEffect(() => stopPronouncing, []);

  /** MEM-104: an item through step 2: its answers are sent at once, after those already on their way. */
  const itemDone = useCallback((item: LearningItem, given: Answer[]) => {
    sending.current = sending.current.then(async () => {
      const outcome = await sendAnswers(item.id, item.cardId, given).catch(() => 'failed' as const);
      if (outcome === 'failed') setFailed((count) => count + 1);
      else if (outcome === 'learned') setKnown((done) => [...done, item]);
      else if (outcome === 'learning') setLearned((done) => [...done, item]);
    });
  }, []);

  /** End of step 2: the summary, once the last answers have reached the API. */
  const finish = useCallback(async () => {
    setPhase('saving');
    await sending.current;
    setPhase('done');
  }, []);

  if (phase === 'done') {
    const remaining = session.total - learned.length - known.length;
    return (
      <section className="learning-done">
        <h2>Session terminée</h2>
        <p>
          {learned.length + known.length === 0 && 'Aucun élément n’a pu être enregistré.'}
          {learned.length > 0 &&
            `${learned.length}\u00a0élément${learned.length > 1 ? 's' : ''} passe${learned.length > 1 ? 'nt' : ''} en apprentissage : ${learned.length > 1 ? 'ils entrent' : 'il entre'} en révision.`}
          {learned.length > 0 && known.length > 0 && ' '}
          {known.length > 0 &&
            `${known.length}\u00a0élément${known.length > 1 ? 's' : ''} déjà connu${known.length > 1 ? 's' : ''} : ${known.length > 1 ? 'ils passent' : 'il passe'} directement à « Appris », sans révision.`}
          {failed > 0 && ` ${failed} n’a pas pu être enregistré (déjà appris ou supprimé entre-temps).`}
        </p>
        <ul className="learning-done__list">
          {learned.map((done) => (
            <li key={done.id}>
              <strong lang="en">{done.word}</strong> → {done.translation}
            </li>
          ))}
          {known.map((done) => (
            <li key={done.id}>
              <strong lang="en">{done.word}</strong> → {done.translation}{' '}
              <span className="learning-done__known">· Appris</span>
            </li>
          ))}
        </ul>
        <p className="learning-done__links">
          <Link href="/anglais" className="space__review">
            Retour à l’anglais
          </Link>
          {remaining > 0 && (
            // MEM-94: the next session is prepared too.
            <a href="/anglais/preparer" className="learning-done__next">
              Apprendre les suivants ({remaining})
            </a>
          )}
        </p>
      </section>
    );
  }

  if (phase === 'listen') {
    return <ListeningStep items={items} canAssess={canAssess} onDone={() => setPhase('evaluate')} />;
  }

  if (phase === 'evaluate') {
    return (
      <LearningEvaluation
        items={items}
        now={now}
        showDelays={showDelays}
        canAssess={canAssess}
        onItemDone={itemDone}
        onFinished={() => void finish()}
      />
    );
  }

  return (
    <p className="review-progress" role="status">
      Enregistrement de la session…
    </p>
  );
}
