-- CreateEnum
CREATE TYPE "SalaryComponentCalcType" AS ENUM ('FIXED', 'PERCENTAGE_OF_BASIC', 'UNIT_RATE');

-- CreateEnum
CREATE TYPE "SalaryUnitType" AS ENUM ('DAY', 'KM', 'TRIP', 'HOUR', 'MONTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PayrollComponentBucket" AS ENUM ('ALLOWANCE', 'BONUS', 'PF', 'EMPLOYER_PF', 'ESI', 'PROFESSION_TAX', 'TAX', 'DEDUCTIONS', 'EMPLOYER_ONLY');

-- AlterTable
ALTER TABLE "SalaryComponent" ADD COLUMN     "calculationType" "SalaryComponentCalcType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "unitType" "SalaryUnitType",
ADD COLUMN     "unitLabel" TEXT;

-- Backfill: existing percentage rows keep their semantics under the new calc-type field
UPDATE "SalaryComponent" SET "calculationType" = 'PERCENTAGE_OF_BASIC' WHERE "isPercentage" = true;

-- CreateTable
CREATE TABLE "PayrollLineComponent" (
    "id" TEXT NOT NULL,
    "payrollLineId" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "label" TEXT NOT NULL,
    "calculationType" "SalaryComponentCalcType" NOT NULL DEFAULT 'FIXED',
    "unitType" "SalaryUnitType",
    "unitLabel" TEXT,
    "rate" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(12,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "bucket" "PayrollComponentBucket" NOT NULL DEFAULT 'ALLOWANCE',
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLineComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollLineComponent_payrollLineId_idx" ON "PayrollLineComponent"("payrollLineId");

-- AddForeignKey
ALTER TABLE "PayrollLineComponent" ADD CONSTRAINT "PayrollLineComponent_payrollLineId_fkey" FOREIGN KEY ("payrollLineId") REFERENCES "PayrollLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
