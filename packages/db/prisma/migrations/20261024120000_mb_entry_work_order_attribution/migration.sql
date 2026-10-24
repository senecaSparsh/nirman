-- Attribute an MB entry to the work order it was measured for.
-- NULL = project-level measurement billable by any covering WO.
ALTER TABLE "MeasurementBookEntry" ADD COLUMN "workOrderId" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD CONSTRAINT "MeasurementBookEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "SubcontractorWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MeasurementBookEntry_workOrderId_idx" ON "MeasurementBookEntry"("workOrderId");
