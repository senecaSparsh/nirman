-- Lump-sum / milestone contracts for subcontractor work orders

-- Enums
CREATE TYPE "WoContractType" AS ENUM ('ITEM_RATE', 'LUMPSUM');
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'BILLED');

-- Work order gains contract type + fixed price
ALTER TABLE "SubcontractorWorkOrder"
  ADD COLUMN "contractType" "WoContractType" NOT NULL DEFAULT 'ITEM_RATE',
  ADD COLUMN "lumpSumAmount" DECIMAL(14,2);

-- Milestones: % of the lump sum billed per stage
CREATE TABLE "WorkOrderMilestone" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "raBillId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderMilestone_workOrderId_idx" ON "WorkOrderMilestone" ("workOrderId");
CREATE INDEX "WorkOrderMilestone_raBillId_idx" ON "WorkOrderMilestone" ("raBillId");

ALTER TABLE "WorkOrderMilestone"
  ADD CONSTRAINT "WorkOrderMilestone_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "SubcontractorWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkOrderMilestone_raBillId_fkey"
    FOREIGN KEY ("raBillId") REFERENCES "RaBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
