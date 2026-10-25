-- MEM-80: the separator of the CSV files becomes any single character. A
-- new column, filled from the former one (a comma stays a comma; every
-- other account, including those that never changed it, gets the
-- semicolon). The former column stays: the previous version of the API
-- keeps working on this schema during the deployment (deploy/README.md).
ALTER TABLE "users" ADD COLUMN "csvDelimiter" TEXT NOT NULL DEFAULT ';';

UPDATE "users" SET "csvDelimiter" = ',' WHERE "csvSeparator" = 'Comma';
