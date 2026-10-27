'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { firstWords, formatDelay } from '../../lib/format';
import type { QuoteLearningItem, QuoteLearningSession } from '../../lib/types';
import { quoteFaces } from '../review/quote-faces';
import type { Answer } from '../review/rating-buttons';
import { ReviewCard } from '../review/review-card';
import { sendAnswers } from './send-answers';

const RATINGS = ['Again', 'Hard', 'Good'] as const;

interface QuoteLearningSessionViewProps {
  session: QuoteLearningSession;
  /** The server's clock, so that the server and the browser show the same delays. */
  now: string;
  /** The delays under the rating buttons: a setting, off by default (MEM-49). */
  showDelays: boolean;
}

/**
 * A learning session of the quotes (MEM-68): a single step, which goes as a
 * review. For each quote, its author and its first words; recite the rest,
 * reveal the whole text, then rate it with the four buttons: the rating is
 * the first review of its card, « Appris » takes it straight to "Appris".
 * « À revoir » puts it back at the bottom of the session (MEM-47), until it
 * gets another answer. The answers are kept here and only sent at the end:
 * leaving the session ("Arrêter", another page) keeps every quote "À
 * apprendre", at its place in the queue.
 * Same card and shortcuts as the review: Space reveals, 1-4 answer.
 */
export function QuoteLearningSessionView({ session, now, showDelays }: QuoteLearningSessionViewProps) {
  const { items } = session;
  const [pile, setPile] = useState(() => items.map((_, index) => index)); // the current one first
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [turn, setTurn] = useState(0); // a fresh card after each answer, even the same quote again
  const [clock, setClock] = useState(now);
  const [result, setResult] = useState<{
    learning: QuoteLearningItem[];
    learned: QuoteLearningItem[];
    failed: number;
  }>();

  const item: QuoteLearningItem | undefined = items[pile[0]];

  /** End of the session: the answers of each quote, in their order. */
  const save = useCallback(
    async (all: Record<string, Answer[]>) => {
      const done = { learning: [] as QuoteLearningItem[], learned: [] as QuoteLearningItem[], failed: 0 };
      for (const it of items) {
        const outcome = await sendAnswers(it.id, it.cardId, all[it.id] ?? []);
        if (outcome === 'failed') done.failed++;
        else if (outcome) done[outcome].push(it);
      }
      setResult(done);
    },
    [items],
  );

  const answer = useCallback(
    async (choice: Answer) => {
      if (!item) return;
      const all = { ...answers, [item.id]: [...(answers[item.id] ?? []), choice] };
      const rest = choice === 'Again' ? [...pile.slice(1), pile[0]] : pile.slice(1);
      setAnswers(all);
      setClock(new Date().toISOString());
      setPile(rest);
      setTurn((n) => n + 1);
      if (rest.length === 0) await save(all);
    },
    [item, answers, pile, save],
  );

  if (result)
    return <Summary result={result} remaining={session.total - result.learning.length - result.learned.length} />;

  if (!item) {
    // All rated: the answers are being sent.
    return (
      <p className="review-progress" role="status">
        Enregistrement de la session…
      </p>
    );
  }

  const position = items.length - pile.length; // the quotes answered so far (« À revoir » doesn't count)
  const due = answers[item.id]?.length ? item.nextDueAfterAgain : item.nextDue; // put back after « À revoir »

  return (
    <section aria-label="Apprentissage des citations">
      <p className="review-progress">
        <strong>Apprendre · Citations</strong> · {position + 1} / {items.length} ·{' '}
        <Link href="/citations">Arrêter</Link>
      </p>
      <ol className="learning-steps" aria-label="Progression">
        {items.map((it, index) => (
          <li key={it.id} className={it === item ? 'is-current' : !pile.includes(index) ? 'is-done' : undefined} />
        ))}
      </ol>
      <ReviewCard
        key={turn}
        {...quoteFaces(item)}
        withLearned
        delays={
          showDelays
            ? Object.fromEntries(RATINGS.map((rating) => [rating, formatDelay(new Date(clock), new Date(due[rating]))]))
            : undefined
        }
        onAnswer={answer}
      />
    </section>
  );
}

/** The end of the session: the quotes now in the review, those already known. */
function Summary({
  result: { learning, learned, failed },
  remaining,
}: {
  result: { learning: QuoteLearningItem[]; learned: QuoteLearningItem[]; failed: number };
  remaining: number;
}) {
  const count = (n: number) => `${n} citation${n > 1 ? 's' : ''}`;
  return (
    <section className="learning-done">
      <h2>Session terminée</h2>
      <p>
        {learning.length + learned.length === 0 && 'Aucune citation n’a pu être enregistrée.'}
        {learning.length > 0 &&
          `${count(learning.length)} ${learning.length > 1 ? 'passent' : 'passe'} en apprentissage : ${learning.length > 1 ? 'elles entrent' : 'elle entre'} en révision.`}
        {learning.length > 0 && learned.length > 0 && ' '}
        {learned.length > 0 &&
          `${count(learned.length)} déjà connue${learned.length > 1 ? 's' : ''} : ${learned.length > 1 ? 'elles passent' : 'elle passe'} directement à « Appris », sans révision.`}
        {failed > 0 &&
          ` ${count(failed)} n’${failed > 1 ? 'ont' : 'a'} pas pu être enregistrée${failed > 1 ? 's' : ''} (déjà apprise${failed > 1 ? 's' : ''} ou supprimée${failed > 1 ? 's' : ''} entre-temps).`}
      </p>
      <ul className="learning-done__list">
        {[...learning, ...learned].map((done) => (
          <li key={done.id}>
            {firstWords(done.text, 8)}
            {done.author && <> — {done.author}</>}
            {learned.includes(done) && <span className="learning-done__known"> · Appris</span>}
          </li>
        ))}
      </ul>
      <p className="learning-done__links">
        <Link href="/citations" className="space__review">
          Apprendre · Réviser
        </Link>
        {remaining > 0 && (
          // MEM-94: the next session is prepared too.
          <a href="/citations/preparer" className="learning-done__next">
            Apprendre les suivantes ({remaining})
          </a>
        )}
      </p>
    </section>
  );
}
