-- MEM-110: the mode of use of the account, Standard or Advanced. A new type
-- and a column with a default value: every existing account gets Standard,
-- and the previous version of the API keeps working on this schema during
-- the deployment (deploy/README.md).
CREATE TYPE "UsageMode" AS ENUM ('Standard', 'Advanced');

ALTER TABLE "users" ADD COLUMN     "usageMode" "UsageMode" NOT NULL DEFAULT 'Standard';
