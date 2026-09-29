-- CreateEnum
CREATE TYPE "CardState" AS ENUM ('New', 'Learning', 'Review', 'Relearning');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('Again', 'Hard', 'Good', 'Easy');

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "learningSteps" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "lapses" INTEGER NOT NULL,
    "state" "CardState" NOT NULL,
    "lastReview" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" "ReviewRating" NOT NULL,
    "state" "CardState" NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "learningSteps" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cards_quoteId_key" ON "cards"("quoteId");

-- CreateIndex
CREATE INDEX "cards_due_idx" ON "cards"("due");

-- CreateIndex
CREATE INDEX "review_logs_cardId_idx" ON "review_logs"("cardId");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (hand-written): quotes created before this phase get a brand-new
-- card, due immediately, so they show up in the first review session.
INSERT INTO "cards" ("id", "quoteId", "due", "stability", "difficulty", "scheduledDays", "learningSteps", "reps", "lapses", "state", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_TIMESTAMP, 0, 0, 0, 0, 0, 0, 'New', CURRENT_TIMESTAMP
FROM "quotes";
