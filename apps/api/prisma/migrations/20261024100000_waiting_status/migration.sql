-- MEM-61: a fourth learning state, "En attente": items not scheduled for
-- learning yet. Alone in its migration: a new enum value can't be used in
-- the transaction that adds it. The previous version of the API ignores it.
ALTER TYPE "LearningStatus" ADD VALUE 'Waiting' BEFORE 'ToLearn';
