-- ───────────────────────────────────────────────────────────────
-- Migration: Add employee hiring fields, salary history, exit records
-- ───────────────────────────────────────────────────────────────

-- Add new fields to Employee table
ALTER TABLE "Employee" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "bloodGroup" TEXT;
ALTER TABLE "Employee" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Employee" ADD COLUMN "documentsSubmitted" BOOLEAN;
ALTER TABLE "Employee" ADD COLUMN "backgroundVerified" BOOLEAN;
ALTER TABLE "Employee" ADD COLUMN "appointmentLetterStatus" TEXT;
ALTER TABLE "Employee" ADD COLUMN "appointmentLetterIssuedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "appointmentLetterAttachmentId" TEXT;

-- Create SalaryHistory table
CREATE TABLE "SalaryHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "components" JSONB NOT NULL,
    "totalCtc" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- Create EmployeeExit table
CREATE TABLE "EmployeeExit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "finalSettlementAmount" DECIMAL(14,2),
    "finalSettlementDate" TIMESTAMP(3),
    "finalSettlementStatus" TEXT,
    "leaveEncashmentDays" INTEGER,
    "leaveEncashmentAmount" DECIMAL(14,2),
    "assetsReturned" BOOLEAN,
    "assetsReturnNotes" TEXT,
    "exitInterviewConducted" BOOLEAN,
    "exitInterviewNotes" TEXT,
    "exitInterviewDate" TIMESTAMP(3),
    "pfExitFiled" BOOLEAN,
    "esiExitFiled" BOOLEAN,
    "terminationReason" TEXT,
    "terminationDate" TIMESTAMP(3) NOT NULL,
    "terminatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeExit_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;

ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "SalaryHistory_employeeId_idx" ON "SalaryHistory"("employeeId");
CREATE INDEX "SalaryHistory_companyId_idx" ON "SalaryHistory"("companyId");
CREATE INDEX "SalaryHistory_effectiveFrom_idx" ON "SalaryHistory"("effectiveFrom");
CREATE INDEX "EmployeeExit_companyId_idx" ON "EmployeeExit"("companyId");
CREATE INDEX "EmployeeExit_terminationDate_idx" ON "EmployeeExit"("terminationDate");
CREATE INDEX "Employee_appointmentLetterStatus_idx" ON "Employee"("appointmentLetterStatus");

-- Unique constraint: one exit record per employee
CREATE UNIQUE INDEX "EmployeeExit_employeeId_key" ON "EmployeeExit"("employeeId");
