-- MEM-76: the FSRS weights optimized on each user's history, per space. A
-- new table: the previous version of the API keeps working on this schema
-- during a deployment (it uses the default weights).
CREATE TYPE "OptimizationStatus" AS ENUM ('Running', 'Succeeded', 'Failed');

CREATE TABLE "fsrs_parameters" (
    "userId" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "weights" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "optimizedAt" TIMESTAMP(3),
    "reviewCount" INTEGER,
    "status" "OptimizationStatus",
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "fsrs_parameters_pkey" PRIMARY KEY ("userId","type")
);

ALTER TABLE "fsrs_parameters" ADD CONSTRAINT "fsrs_parameters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
