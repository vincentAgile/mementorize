'use client';

import { SPACES } from '../../lib/spaces';
import type { ItemType } from '../../lib/types';
import { saveRetentionAction } from './actions';
import { AutoSelect } from './auto-save';

/** The three levels (MEM-75), each with what it means. */
const LEVELS = [
  { value: 85, label: '85\u00a0% — moins de révisions, plus d’oublis' },
  { value: 90, label: '90\u00a0% — équilibre recommandé' },
  { value: 95, label: '95\u00a0% — souvenir plus solide, nettement plus de révisions' },
];

/** In the order of the story: Anglais, Citations, Cartes mentales. */
const ORDER: ItemType[] = ['Vocabulary', 'Quote', 'MindMap'];

/**
 * The target retention of each space (MEM-75): the probability of
 * remembering a card at which it comes back. Saved at the selection
 * (MEM-79); it applies from the next review of each card.
 */
export function RetentionForm({ retentions }: { retentions: Record<ItemType, number> }) {
  return (
    <section className="settings">
      <h2>Rétention cible</h2>
      <p className="page__subtitle">
        Mementorize vous fait réviser une carte quand la probabilité de vous en souvenir descend à ce niveau. Un
        changement s’applique à la prochaine révision de chaque carte : les dates déjà programmées ne sont pas
        recalculées.
      </p>
      <div className="settings__form">
        {ORDER.map((type) => {
          const space = SPACES.find((one) => one.type === type)!;
          return (
            <AutoSelect
              key={type}
              label={space.label}
              name={`retention-${type}`}
              initial={retentions[type]}
              options={LEVELS}
              save={(value) => saveRetentionAction(type, value)}
            />
          );
        })}
      </div>
    </section>
  );
}
