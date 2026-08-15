-- Remove the visual playground / custom workspaces feature.
-- Drops the CustomWorkspace table and the Task -> CustomWorkspace FK,
-- plus the playground-specific Task columns (workspaceId, nodeLabel).

-- 1. Drop the foreign key on Task.workspaceId before dropping the column.
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_workspaceId_fkey";

-- 2. Drop the playground-specific indexes on Task.
DROP INDEX IF EXISTS "Task_workspaceId_idx";

-- 3. Drop the playground-specific columns on Task.
ALTER TABLE "Task" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "nodeLabel";

-- 4. Drop the CustomWorkspace table and its indexes.
DROP INDEX IF EXISTS "CustomWorkspace_deletedAt_idx";
DROP INDEX IF EXISTS "CustomWorkspace_companyId_idx";
DROP TABLE IF EXISTS "CustomWorkspace";
