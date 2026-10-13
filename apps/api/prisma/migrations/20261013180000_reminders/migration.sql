-- Phase 11: e-mail reminders of the due reviews. Only columns with a
-- default value: the previous version of the API keeps working on this
-- schema during a deployment (deploy/README.md, "Les migrations").
ALTER TABLE "users" ADD COLUMN     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "reminderTimeZone" TEXT NOT NULL DEFAULT 'Europe/Paris',
ADD COLUMN     "reminderLastSentOn" TEXT;
