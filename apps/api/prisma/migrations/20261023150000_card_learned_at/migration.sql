-- MEM-48: « Appris » for a quote or a mind map branch, per card. A nullable
-- column: the previous version of the API keeps working on this schema
-- during a deployment (deploy/README.md).
ALTER TABLE "cards" ADD COLUMN     "learnedAt" TIMESTAMP(3);
