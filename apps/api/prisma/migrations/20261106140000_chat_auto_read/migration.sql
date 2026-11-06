-- MEM-132: « Lire automatiquement les réponses » of the « Chat IA », on by
-- default. Additive: a column with a default; the previous version of the
-- API ignores it.
ALTER TABLE "users" ADD COLUMN "chatAutoRead" BOOLEAN NOT NULL DEFAULT true;
