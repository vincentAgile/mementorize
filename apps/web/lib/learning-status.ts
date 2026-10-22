import type { LearningStatus } from './types';

/** How the learning state of a vocabulary item reads in the app (MEM-15). */
export const LEARNING_STATUS_LABELS: Record<LearningStatus, string> = {
  ToLearn: 'À apprendre',
  Learning: 'En cours d’apprentissage',
  Learned: 'Appris',
};
