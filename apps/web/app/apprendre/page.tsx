import type { Metadata } from 'next';
import Link from 'next/link';
import { getLearningSession, getPreferences } from '../../lib/api';
import { AppHeader } from '../app-header';
import { LearningSessionView } from './learning-session';

export const metadata: Metadata = { title: 'Apprendre · Anglais' };

// The learning process of the vocabulary (MEM-21): a session of up to five
// new items, discovered then rated once, before they join the review.
export default async function LearningPage() {
  const [session, preferences] = await Promise.all([getLearningSession(), getPreferences()]);

  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">Apprendre</h1>
        {session.items.length === 0 ? (
          <section className="review-empty">
            <h2>Rien à apprendre pour le moment</h2>
            <p>
              Les éléments ajoutés dans l’espace Anglais arrivent ici avant d’entrer en révision.{' '}
              <Link href="/anglais">Retour à l’anglais</Link>
            </p>
          </section>
        ) : (
          <LearningSessionView
            session={session}
            now={new Date().toISOString()}
            showDelays={preferences.showReviewDelays}
          />
        )}
      </main>
    </>
  );
}
