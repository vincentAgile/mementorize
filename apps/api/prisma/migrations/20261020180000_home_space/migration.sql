-- MEM-6: the subject space opened on arrival. A column with a default
-- value only: the previous version of the API keeps working on this schema
-- during a deployment (deploy/README.md, "Les migrations").
ALTER TABLE "users" ADD COLUMN     "homeSpace" "ItemType" NOT NULL DEFAULT 'Vocabulary';
