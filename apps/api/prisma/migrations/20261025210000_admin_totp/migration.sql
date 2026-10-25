-- MEM-86: the two-step login (TOTP) of the administration console.
ALTER TABLE "admin_accounts" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpPendingSecret" TEXT;

CREATE TABLE "admin_recovery_codes" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_recovery_codes_adminId_idx" ON "admin_recovery_codes"("adminId");

ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
