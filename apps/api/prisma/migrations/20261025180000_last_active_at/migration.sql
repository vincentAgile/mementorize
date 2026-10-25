-- MEM-83: the last use of the app, per user (null until the next use).
ALTER TABLE "users" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
