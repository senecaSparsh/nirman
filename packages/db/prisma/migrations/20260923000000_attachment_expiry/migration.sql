-- AlterTable
ALTER TABLE "EntityAttachment" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EntityAttachment_entityType_expiresAt_idx" ON "EntityAttachment"("entityType", "expiresAt");
