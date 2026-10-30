'use client';

import type { UsageMode } from '../../lib/types';
import { saveUsageModeAction } from './actions';
import { AutoSelect } from './auto-save';

/** The modes of use and their labels (MEM-110). */
export const USAGE_MODE_LABELS: Record<UsageMode, string> = { Standard: 'Standard', Advanced: 'Avancé' };

/**
 * Choice of the mode of use (MEM-110): Standard by default, or Avancé, which
 * adds actions that change the learning (MEM-111); nothing else. Saved at
 * the selection (MEM-79).
 */
export function UsageModeForm({ usageMode }: { usageMode: UsageMode }) {
  return (
    <section className="settings">
      <h2>Mode d’utilisation</h2>
      <p className="page__subtitle">
        Le mode Avancé ajoute des actions qui modifient l’apprentissage, comme la réinitialisation d’un élément.
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Mode d’utilisation"
          name="usageMode"
          initial={usageMode}
          options={(['Standard', 'Advanced'] as const).map((mode) => ({ value: mode, label: USAGE_MODE_LABELS[mode] }))}
          save={saveUsageModeAction}
        />
      </div>
    </section>
  );
}
