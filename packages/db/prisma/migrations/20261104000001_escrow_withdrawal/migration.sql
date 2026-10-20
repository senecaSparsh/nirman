-- EscrowWithdrawal — certified RERA escrow withdrawals (S.4(2)(l)(D)).
CREATE TABLE "EscrowWithdrawal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "withdrawalNo" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "purpose" TEXT NOT NULL,
    "engineerName" TEXT NOT NULL,
    "architectName" TEXT NOT NULL,
    "caName" TEXT NOT NULL,
    "certificateUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "voidReason" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EscrowWithdrawal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EscrowWithdrawal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EscrowWithdrawal_projectId_idx" ON "EscrowWithdrawal"("projectId");
CREATE INDEX "EscrowWithdrawal_companyId_idx" ON "EscrowWithdrawal"("companyId");
