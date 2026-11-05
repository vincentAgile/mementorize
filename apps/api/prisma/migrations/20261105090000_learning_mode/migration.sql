-- MEM-125: the learning mode of the account, Guided or Autonomous. A new type
-- and a column with a default value: every existing account gets Guided, and
-- the previous version of the API keeps working on this schema during the
-- deployment (deploy/README.md).
CREATE TYPE "LearningMode" AS ENUM ('Guided', 'Autonomous');

ALTER TABLE "users" ADD COLUMN     "learningMode" "LearningMode" NOT NULL DEFAULT 'Guided';
