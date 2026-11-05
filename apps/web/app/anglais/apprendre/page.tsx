import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPreferences, pronunciationAssessmentEnabled } from '../../../lib/api';
import { MAX_SESSION_SIZE } from '../../../lib/session-preparation';
import { learningModeOf } from '../../../lib/types';
import { StartLink } from './start-link';

export const metadata: Metadata = { title: 'Comment se passe l’apprentissage ? · Anglais' };

/** The steps of a learning session, numbered as its headings (steps 1 to 3); the selection comes before, unnumbered. */
function steps(assessment: boolean) {
  return [
    {
      when: 'Avant de commencer',
      name: 'Sélectionner les cartes à apprendre',
      text: `Choisis jusqu’à ${MAX_SESSION_SIZE} cartes dans ta file.`,
    },
    {
      when: 'Étape 1',
      name: 'Écouter et prononcer',
      // The assessment only when it is configured (MEM-90).
      text: assessment
        ? 'Écoute chaque mot ou expression anglaise, répète et évalue ta prononciation.'
        : 'Écoute chaque mot ou expression anglaise, puis répète.',
    },
    {
      when: 'Étape 2',
      name: 'Restituer en français',
      text: 'Tu vois le mot ou l’expression en anglais : retrouve sa traduction, puis vérifie.',
    },
    {
      when: 'Étape 3',
      name: 'Restituer en anglais',
      text: 'Tu vois le mot ou l’expression en français : retrouve la traduction en anglais, puis évalue ta réponse.',
    },
  ];
}

/**
 * MEM-127: in the Guided learning mode (MEM-125), « Apprendre » opens this
 * page first: how a learning session goes, step by step, with the numbers
 * of the headings of the session, then « Commencer », to the preparation
 * (MEM-94). Decided on the server: in the Autonomous mode, straight to the
 * preparation.
 */
export default async function LearningIntroPage() {
  const [preferences, assessment] = await Promise.all([getPreferences(), pronunciationAssessmentEnabled()]);
  if (learningModeOf(preferences) !== 'Guided') redirect('/anglais/preparer');

  return (
    <section className="learning-intro" aria-labelledby="learning-intro-title">
      <h2 id="learning-intro-title" className="learning-intro__title">
        Comment se passe l’apprentissage ?
      </h2>
      <ol className="learning-intro__steps">
        {steps(assessment).map((step) => (
          <li key={step.name} className="learning-intro__step">
            <span className="learning-intro__when">{step.when}</span>
            <span className="learning-intro__name">{step.name}</span>
            <span className="learning-intro__text">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="learning-intro__actions">
        <StartLink href="/anglais/preparer" />
        <Link href="/anglais" className="learning-intro__back">
          Retour
        </Link>
      </p>
    </section>
  );
}
