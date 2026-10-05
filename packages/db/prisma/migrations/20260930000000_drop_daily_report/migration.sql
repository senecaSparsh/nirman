-- The DailyReport model (free-text site ops log) was fully built but never
-- wired to any UI — the structured DailyProgressReport (DPR) is the canonical
-- daily-reporting system. Dropping the orphaned table.
DROP TABLE IF EXISTS "DailyReport";
