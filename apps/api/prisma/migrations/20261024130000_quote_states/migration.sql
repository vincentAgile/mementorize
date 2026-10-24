-- MEM-67: the quotes take the four states of the vocabulary. The existing
-- quotes stay in the review ("En cours d'apprentissage", the default), with
-- their history and their schedule; those marked « Appris » (MEM-48, on
-- their card) become "Appris", learned per item from now on, their card
-- back to the schedule it had. None goes "En attente" nor "À apprendre":
-- the learning queue of the quotes starts empty.
UPDATE "items" SET "learningStatus" = 'Learned'
WHERE "type" = 'Quote' AND EXISTS (
  SELECT 1 FROM "cards" WHERE "cards"."itemId" = "items"."id" AND "cards"."learnedAt" IS NOT NULL
);

UPDATE "cards" SET "learnedAt" = NULL
FROM "items"
WHERE "cards"."itemId" = "items"."id" AND "items"."type" = 'Quote' AND "cards"."learnedAt" IS NOT NULL;
