-- Phase 5: the "quotes" table becomes the generic "items" table.
--
-- Written by hand: from the schema alone, Prisma would read this change as
-- "drop quotes, create items", which would delete every quote along with
-- its card and review history. Here the existing rows are transformed in
-- place instead: same ids, same cards, same history.

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('Quote', 'Vocabulary');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('QuoteRecall', 'EnglishToFrench', 'FrenchToEnglish');

-- 1. quotes -> items (table, primary key, foreign key and index renamed to
--    the names Prisma expects for the new model)
ALTER TABLE "quotes" RENAME TO "items";
ALTER TABLE "items" RENAME CONSTRAINT "quotes_pkey" TO "items_pkey";
ALTER TABLE "items" RENAME CONSTRAINT "quotes_userId_fkey" TO "items_userId_fkey";
ALTER INDEX "quotes_userId_idx" RENAME TO "items_userId_idx";

-- 2. New "type" and "content" columns, filled from the old quote columns,
--    which are then dropped
ALTER TABLE "items"
    ADD COLUMN "type" "ItemType" NOT NULL DEFAULT 'Quote',
    ADD COLUMN "content" JSONB;

UPDATE "items"
SET "content" = jsonb_build_object('text', "text", 'author', "author", 'source', "source");

ALTER TABLE "items"
    ALTER COLUMN "type" DROP DEFAULT,
    ALTER COLUMN "content" SET NOT NULL,
    DROP COLUMN "text",
    DROP COLUMN "author",
    DROP COLUMN "source";

-- 3. cards: "quoteId" -> "itemId", and a "kind" column (an item can now
--    have several cards, one per kind)
ALTER TABLE "cards" RENAME COLUMN "quoteId" TO "itemId";
ALTER TABLE "cards" RENAME CONSTRAINT "cards_quoteId_fkey" TO "cards_itemId_fkey";
DROP INDEX "cards_quoteId_key";

ALTER TABLE "cards" ADD COLUMN "kind" "CardKind" NOT NULL DEFAULT 'QuoteRecall';
ALTER TABLE "cards" ALTER COLUMN "kind" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "cards_itemId_kind_key" ON "cards"("itemId", "kind");
