-- Add submittedById and submittedAt audit fields to MaterialRequisition
-- These track who explicitly submitted the requisition for approval (separate from requestedById)
-- and when, enabling self-approval guards at the service layer.

ALTER TABLE "MaterialRequisition" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "MaterialRequisition" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- Add foreign key constraint for submittedById → User
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for the new foreign key
CREATE INDEX "MaterialRequisition_submittedById_idx" ON "MaterialRequisition"("submittedById");
