-- AlterTable
ALTER TABLE "WorkerAttendance" ADD COLUMN     "offSiteReview" TEXT,
ADD COLUMN     "offSiteReviewNote" TEXT,
ADD COLUMN     "offSiteReviewedAt" TIMESTAMP(3),
ADD COLUMN     "offSiteReviewedById" TEXT;

-- AddForeignKey
ALTER TABLE "WorkerAttendance" ADD CONSTRAINT "WorkerAttendance_offSiteReviewedById_fkey" FOREIGN KEY ("offSiteReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
