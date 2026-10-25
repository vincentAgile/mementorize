-- MEM-75: the target retention of each space, in percent, 90 by default
-- (existing accounts included). Columns with a default value: the previous
-- version of the API keeps working on this schema during a deployment.
ALTER TABLE "users" ADD COLUMN "vocabularyRetention" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "quoteRetention" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "mindMapRetention" INTEGER NOT NULL DEFAULT 90;

-- The former separator of the CSV files (MEM-55), replaced by csvDelimiter
-- in MEM-80: no version of the API in production reads it any more.
ALTER TABLE "users" DROP COLUMN "csvSeparator";

DROP TYPE "CsvSeparator";
