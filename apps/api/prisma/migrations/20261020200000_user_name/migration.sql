-- MEM-11: the name of the user, optional. A nullable column: existing
-- accounts have no name, and the previous version of the API keeps working
-- on this schema during a deployment (deploy/README.md, "Les migrations").
ALTER TABLE "users" ADD COLUMN     "name" TEXT;
