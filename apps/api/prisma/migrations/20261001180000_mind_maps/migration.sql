-- Phase 6: mind maps.
--
-- A mind map is an item like the others (its tree is stored in the jsonb
-- "content" column), but it has one card per branch instead of a fixed set
-- of cards: "cards" gets a "nodeId" column, which becomes part of the
-- uniqueness key.

-- AlterEnum
ALTER TYPE "ItemType" ADD VALUE 'MindMap';

-- AlterEnum
ALTER TYPE "CardKind" ADD VALUE 'BranchRecall';

-- AlterTable
ALTER TABLE "cards" ADD COLUMN "nodeId" TEXT;

-- DropIndex
DROP INDEX "cards_itemId_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "cards_itemId_kind_nodeId_key" ON "cards"("itemId", "kind", "nodeId");
