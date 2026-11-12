-- MEM-144: the Chat IA granted account by account in the console, off by
-- default (every account, existing or new). Additive: a column with a
-- default; the previous version of the API ignores it.
ALTER TABLE "users" ADD COLUMN "chatAiEnabled" BOOLEAN NOT NULL DEFAULT false;
