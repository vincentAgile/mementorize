-- MEM-116: the predefined lists of vocabulary of the console (« Catalogue »)
-- and their words, each list with its level. Additive only: a new type and
-- two new tables, nothing changed in the others; the previous version of the
-- API keeps working on this schema during the deployment (deploy/README.md).

CREATE TYPE "LanguageLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

CREATE TABLE "predefined_lists" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" "LanguageLevel" NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefined_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "predefined_entries" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "french" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "topic" TEXT,
    "frenchExample" TEXT,
    "englishExample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefined_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "predefined_entries_listId_position_idx" ON "predefined_entries"("listId", "position");

ALTER TABLE "predefined_entries" ADD CONSTRAINT "predefined_entries_listId_fkey" FOREIGN KEY ("listId") REFERENCES "predefined_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
