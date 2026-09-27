-- AddColumn: rate snapshot so a mid-period wage change doesn't retro-apply
ALTER TABLE "WorkerAttendance" ADD COLUMN "dailyRate" DECIMAL(14,2);
