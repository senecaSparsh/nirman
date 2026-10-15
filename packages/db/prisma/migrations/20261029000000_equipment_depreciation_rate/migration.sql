-- Equipment.annualDepreciationRate: straight-line fraction per year
-- (0.15 = 15%). Null → asset doesn't depreciate. Drives the monthly
-- /api/cron/depreciation run (Dr Depreciation Expense / Cr Accumulated
-- Depreciation, floored at zero remaining book value).
ALTER TABLE "Equipment" ADD COLUMN "annualDepreciationRate" NUMERIC(6,4);
