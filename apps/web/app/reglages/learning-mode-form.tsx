'use client';

import type { LearningMode } from '../../lib/types';
import { saveLearningModeAction } from './actions';
import { AutoSelect } from './auto-save';

/** The learning modes and their labels (MEM-125). */
export const LEARNING_MODE_LABELS: Record<LearningMode, string> = { Guided: 'Guidé', Autonomous: 'Autonome' };

/**
 * Choice of the learning mode (MEM-125): Guidé by default, which explains
 * each step of the learning of the vocabulary and asks the question, or
 * Autonome. Not the mode of use (Standard / Avancé, MEM-110), just above it.
 * Saved at the selection (MEM-79).
 */
export function LearningModeForm({ learningMode }: { learningMode: LearningMode }) {
  return (
    <section className="settings">
      <h2>Mode d’apprentissage</h2>
      <p className="page__subtitle">
        « Guidé » explique chaque étape de l’apprentissage et pose la question ; « Autonome » va droit au but.
      </p>
      <div className="settings__form">
        <AutoSelect
          label="Mode d’apprentissage"
          name="learningMode"
          initial={learningMode}
          options={(['Guided', 'Autonomous'] as const).map((mode) => ({
            value: mode,
            label: LEARNING_MODE_LABELS[mode],
          }))}
          save={saveLearningModeAction}
        />
      </div>
    </section>
  );
}
