-- MEM-88: the two-step login can be turned off, account by account, and each change is journaled.
ALTER TABLE "admin_accounts" ADD COLUMN "totpDisabledAt" TIMESTAMP(3);

CREATE TABLE "admin_security_events" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "email" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_security_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_security_events_adminId_idx" ON "admin_security_events"("adminId");

ALTER TABLE "admin_security_events" ADD CONSTRAINT "admin_security_events_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
