import type { Metadata } from 'next';
import { duplicateKey, UNAVAILABLE } from '../../../../lib/ai-lists';
import { getAiListStatus, getItems, getPreferences } from '../../../../lib/api';
import { SPACES } from '../../../../lib/spaces';
import { learningModeOf } from '../../../../lib/types';
import { BackToChoice } from '../back-to-choice';
import { AiListGenerator } from './ai-list-generator';

export const metadata: Metadata = { title: 'Générer avec l’IA · Ajouter une liste' };

/**
 * MEM-140/141: « Générer avec l'IA », the third way to add a list: the
 * settings, then the cards proposed, to correct and add to « Ma liste ».
 * Without an AI configured, the page only says so. The English of « Ma
 * liste » is given to the page, to tell a corrected row already there.
 */
export default async function AiListPage() {
  const status = await getAiListStatus();
  if (!status.enabled) {
    return (
      <section className="ai-list" aria-labelledby="ai-list-title">
        <BackToChoice />
        <h2 id="ai-list-title" className="add-list__title">
          Générer avec l’IA
        </h2>
        <p className="notice" role="status">
          {UNAVAILABLE}
        </p>
      </section>
    );
  }
  const [items, preferences] = await Promise.all([getItems('Vocabulary'), getPreferences()]);
  const owned = items.flatMap((item) => (item.type === 'Vocabulary' ? [duplicateKey(item.content.word)] : []));
  // « Apprendre » after the addition, as the tab « Apprendre · Réviser » (MEM-127).
  const space = SPACES.find((entry) => entry.type === 'Vocabulary')!;
  const learnHref =
    space.introHref && learningModeOf(preferences) === 'Guided' ? space.introHref : (space.prepareHref ?? space.href);
  return <AiListGenerator remaining={status.remaining} owned={owned} learnHref={learnHref} />;
}
