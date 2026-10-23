-- MEM-58: items per page of the vocabulary list, 20 by default. A column
-- with a default value: the previous version of the API keeps working on
-- this schema during a deployment (deploy/README.md).
ALTER TABLE "users" ADD COLUMN     "vocabularyPageSize" INTEGER NOT NULL DEFAULT 20;
