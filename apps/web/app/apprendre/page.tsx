import type { Metadata } from 'next';
import Link from 'next/link';
import { getLearningSession, getPreferences, getQuoteLearningSession } from '../../lib/api';
import { AppHeader } from '../app-header';
import { LearningSessionView } from './learning-session';
import { QuoteLearningSessionView } from './quote-learning-session';

type Props = { searchParams: Promise<{ type?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: (await searchParams).type === 'Quote' ? 'Apprendre · Citations' : 'Apprendre · Anglais' };
}

// The learning process (MEM-21): a session of up to five new items, the
// first ones of the learning queue, before they join the review. The
// vocabulary in two steps (discovered, then rated); with ?type=Quote, the
// quotes in one, as a review (MEM-68).
export default async function LearningPage({ searchParams }: Props) {
  const quotes = (await searchParams).type === 'Quote';
  const now = new Date().toISOString();
  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">{quotes ? 'Apprendre · Citations' : 'Apprendre'}</h1>
        {quotes ? <QuotesSession now={now} /> : <VocabularySession now={now} />}
      </main>
    </>
  );
}

async function VocabularySession({ now }: { now: string }) {
  const [session, { showReviewDelays }] = await Promise.all([getLearningSession(), getPreferences()]);
  if (session.items.length === 0) {
    return (
      <NothingToLearn>
        Les éléments ajoutés dans l’espace Anglais arrivent ici avant d’entrer en révision.{' '}
        <Link href="/anglais">Retour à l’anglais</Link>
      </NothingToLearn>
    );
  }
  return <LearningSessionView session={session} now={now} showDelays={showReviewDelays} />;
}

async function QuotesSession({ now }: { now: string }) {
  const [session, { showReviewDelays }] = await Promise.all([getQuoteLearningSession(), getPreferences()]);
  if (session.items.length === 0) {
    return (
      <NothingToLearn>
        Les citations de la file d’apprentissage arrivent ici avant d’entrer en révision.{' '}
        <Link href="/citations">Retour aux citations</Link>
      </NothingToLearn>
    );
  }
  return <QuoteLearningSessionView session={session} now={now} showDelays={showReviewDelays} />;
}

function NothingToLearn({ children }: { children: React.ReactNode }) {
  return (
    <section className="review-empty">
      <h2>Rien à apprendre pour le moment</h2>
      <p>{children}</p>
    </section>
  );
}
