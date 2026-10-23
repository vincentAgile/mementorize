-- MEM-55: the separator of the CSV files, a semicolon by default. A new
-- type and a column with a default value: the previous version of the API
-- keeps working on this schema during a deployment (deploy/README.md).
CREATE TYPE "CsvSeparator" AS ENUM ('Semicolon', 'Comma');

ALTER TABLE "users" ADD COLUMN     "csvSeparator" "CsvSeparator" NOT NULL DEFAULT 'Semicolon';
