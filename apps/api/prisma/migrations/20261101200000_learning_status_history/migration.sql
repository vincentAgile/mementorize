-- The history of the learning states of the items: one row each time the
-- `learningStatus` of an item is set (its creation, then each change), for
-- the progress chart at the end of a learning session.
--
-- Written by the database itself (the trigger at the end), whatever the code
-- that changes the state: learning, « Appris », « Revoir », reset, queue,
-- import. The previous version of the API keeps working during the
-- deployment (deploy/README.md): it doesn't know the table, and its changes
-- are recorded too.

CREATE TABLE "learning_status_changes" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "LearningStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_status_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_status_changes_itemId_changedAt_idx" ON "learning_status_changes"("itemId", "changedAt");

ALTER TABLE "learning_status_changes" ADD CONSTRAINT "learning_status_changes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The past, rebuilt from the review history (review_logs), for the
-- vocabulary and the quotes (a mind map is always "Learning"):
--   * each rating puts the item in "Learning", « Appris » (rating `Learned`)
--     in "Learned"; a rating after « Appris » means it was learned again;
--   * its creation: "ToLearn" when it was reviewed since, its current state
--     otherwise (nothing happened to it);
--   * then its current state, when the history ends on another one (a reset,
--     « Revoir » not reviewed since, a move between "Waiting" and "ToLearn").
-- The moves between "Waiting" and "ToLearn" before today are not known.
WITH reviews AS (
    SELECT DISTINCT c."itemId", l."reviewedAt" AS "at",
           (CASE WHEN l."rating" = 'Learned' THEN 'Learned' ELSE 'Learning' END)::"LearningStatus" AS "status"
    FROM "review_logs" l
    JOIN "cards" c ON c."id" = l."cardId"
    JOIN "items" i ON i."id" = c."itemId"
    WHERE i."type" IN ('Vocabulary', 'Quote')
),
created AS (
    -- At the latest, its first review (LEAST ignores the null of an item never reviewed).
    SELECT i."id" AS "itemId", LEAST(i."createdAt", (SELECT MIN(r."at") FROM reviews r WHERE r."itemId" = i."id")) AS "at",
           (CASE WHEN EXISTS (SELECT 1 FROM reviews r WHERE r."itemId" = i."id") THEN 'ToLearn' ELSE i."learningStatus"::text END)::"LearningStatus" AS "status",
           0 AS "rank"
    FROM "items" i
),
events AS (
    SELECT "itemId", "at", "status", 0 AS "rank" FROM created
    UNION ALL
    SELECT "itemId", "at", "status", 1 AS "rank" FROM reviews
),
changes AS (
    SELECT "itemId", "at", "status", "rank",
           LAG("status") OVER (PARTITION BY "itemId" ORDER BY "at", "rank", "status") AS "previous"
    FROM events
),
-- Two changes at the same time (a rating, then « Appris »): a millisecond
-- apart, in their order, so that reading the history by date is unambiguous.
kept AS (
    SELECT "itemId", "status", "rank",
           "at" + (ROW_NUMBER() OVER (PARTITION BY "itemId", "at" ORDER BY "rank", "status") - 1) * INTERVAL '1 millisecond' AS "at"
    FROM changes
    WHERE "previous" IS DISTINCT FROM "status"
),
"last" AS (
    SELECT DISTINCT ON ("itemId") "itemId", "at", "status"
    FROM kept
    ORDER BY "itemId", "at" DESC, "rank" DESC, "status" DESC
)
INSERT INTO "learning_status_changes" ("id", "itemId", "status", "changedAt")
SELECT gen_random_uuid()::text, "itemId", "status", "at" FROM kept
UNION ALL
SELECT gen_random_uuid()::text, i."id", i."learningStatus", GREATEST(i."updatedAt", l."at" + INTERVAL '1 millisecond')
FROM "items" i
JOIN "last" l ON l."itemId" = i."id"
WHERE l."status" <> i."learningStatus";

-- From now on: a row each time an item is created, or its state changes.
-- The time is the UTC one, as Prisma writes the other dates.
CREATE FUNCTION "record_learning_status"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW."learningStatus" IS DISTINCT FROM OLD."learningStatus" THEN
        INSERT INTO "learning_status_changes" ("id", "itemId", "status", "changedAt")
        VALUES (gen_random_uuid()::text, NEW."id", NEW."learningStatus", clock_timestamp() AT TIME ZONE 'UTC');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "items_learning_status_history"
AFTER INSERT OR UPDATE OF "learningStatus" ON "items"
FOR EACH ROW EXECUTE FUNCTION "record_learning_status"();
