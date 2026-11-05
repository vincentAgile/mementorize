-- « Espace cartes mentales »: a setting of the account, off by default. A
-- column with a default value (the previous version of the API keeps
-- working on this schema during the deployment, deploy/README.md); the
-- accounts that already have mind maps keep seeing them: on for them.
ALTER TABLE "users" ADD COLUMN     "mindMapsEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" SET "mindMapsEnabled" = true
WHERE EXISTS (SELECT 1 FROM "items" WHERE "items"."userId" = "users"."id" AND "items"."type" = 'MindMap');
