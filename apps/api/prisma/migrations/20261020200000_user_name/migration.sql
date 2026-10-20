-- MEM-11: the first name and last name of the user, both optional.
-- Nullable columns: existing accounts have neither, and the previous version
-- of the API keeps working on this schema during a deployment
-- (deploy/README.md, "Les migrations").
ALTER TABLE "users" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;
