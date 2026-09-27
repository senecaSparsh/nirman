-- CreateTable
CREATE TABLE "EquipmentUsageLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meterKind" TEXT NOT NULL DEFAULT 'HOURS',
    "openingMeter" DECIMAL(14,2),
    "closingMeter" DECIMAL(14,2),
    "fuelLitres" DECIMAL(14,3),
    "fuelCost" DECIMAL(14,2),
    "operatorName" TEXT,
    "notes" TEXT,
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentUsageLog_equipmentId_logDate_idx" ON "EquipmentUsageLog"("equipmentId", "logDate");

-- CreateIndex
CREATE INDEX "EquipmentUsageLog_companyId_idx" ON "EquipmentUsageLog"("companyId");

-- CreateIndex
CREATE INDEX "EquipmentUsageLog_projectId_idx" ON "EquipmentUsageLog"("projectId");

-- AddForeignKey
ALTER TABLE "EquipmentUsageLog" ADD CONSTRAINT "EquipmentUsageLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUsageLog" ADD CONSTRAINT "EquipmentUsageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUsageLog" ADD CONSTRAINT "EquipmentUsageLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUsageLog" ADD CONSTRAINT "EquipmentUsageLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
