-- MEM-44: the translation service of the translate buttons. A new type and
-- a column with a default value: the previous version of the API keeps
-- working on this schema during a deployment (deploy/README.md).
CREATE TYPE "Translator" AS ENUM ('DeepL', 'Google');

ALTER TABLE "users" ADD COLUMN     "translator" "Translator" NOT NULL DEFAULT 'DeepL';
