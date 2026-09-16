-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "onBehalfOfId" TEXT;

-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reopenedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'client';

-- AlterTable
ALTER TABLE "UserCompany" ADD COLUMN     "approvalsDelegatedToId" TEXT,
ADD COLUMN     "delegationEndsAt" TIMESTAMP(3),
ADD COLUMN     "delegationNote" TEXT,
ADD COLUMN     "delegationStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorLog_resolvedAt_idx" ON "ErrorLog"("resolvedAt");

-- CreateIndex
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserCompany_approvalsDelegatedToId_idx" ON "UserCompany"("approvalsDelegatedToId");

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_approvalsDelegatedToId_fkey" FOREIGN KEY ("approvalsDelegatedToId") REFERENCES "UserCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_onBehalfOfId_fkey" FOREIGN KEY ("onBehalfOfId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
