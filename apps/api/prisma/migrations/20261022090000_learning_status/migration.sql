-- MEM-15: learning state of an item. Existing items (vocabulary included)
-- become `Learning`, the default: they keep their cards and schedule and stay
-- in the review. A column with a default value only: the previous version of
-- the API keeps working on this schema during a deployment (deploy/README.md,
-- "Les migrations").
CREATE TYPE "LearningStatus" AS ENUM ('ToLearn', 'Learning', 'Learned');

ALTER TABLE "items" ADD COLUMN     "learningStatus" "LearningStatus" NOT NULL DEFAULT 'Learning';
