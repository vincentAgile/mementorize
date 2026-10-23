-- MEM-49: show the delays on the rating buttons, off by default. A column
-- with a default value: the previous version of the API keeps working on
-- this schema during a deployment (deploy/README.md).
ALTER TABLE "users" ADD COLUMN     "showReviewDelays" BOOLEAN NOT NULL DEFAULT false;
