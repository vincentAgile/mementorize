-- MEM-61: the learning queue is ordered. The items to learn keep their
-- order of today, oldest first; no item goes "En attente". A nullable
-- column: the previous version of the API keeps working on this schema
-- during a deployment (its new items, without position, go last).
ALTER TABLE "items" ADD COLUMN     "learnPosition" INTEGER;

UPDATE "items" SET "learnPosition" = queue.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") AS position
  FROM "items"
  WHERE "type" = 'Vocabulary' AND "learningStatus" = 'ToLearn'
) AS queue
WHERE "items"."id" = queue."id";
