-- MEM-131: the privacy notice of the « Chat IA », read once. Additive: a
-- column with a default; the previous version of the API ignores it.
ALTER TABLE "users" ADD COLUMN "chatNoticeAccepted" BOOLEAN NOT NULL DEFAULT false;
