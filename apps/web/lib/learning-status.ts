import type { LearningStatus } from './types';

/**
 * How the learning state of a vocabulary item reads in the app (MEM-15), in
 * the order of the process: "En attente" (MEM-61), not scheduled yet, then
 * the learning queue, the review, and out of it.
 */
export const LEARNING_STATUS_LABELS: Record<LearningStatus, string> = {
  Waiting: 'En attente',
  ToLearn: 'À apprendre',
  Learning: 'En cours d’apprentissage',
  Learned: 'Appris',
};
