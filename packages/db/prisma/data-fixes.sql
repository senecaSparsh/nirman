-- Data fixes that run after `prisma db push` on every deploy.
-- These are idempotent — safe to run on every deploy.
-- `db push` only syncs schema structure, not data, so migration SQL
-- files with DML (UPDATE/INSERT) are never executed by it.

-- Rename auto-created "Nirman Constructions" to "My Company" placeholder
UPDATE "Company" SET name = 'My Company', gstin = NULL, pan = NULL, address = NULL WHERE name = 'Nirman Constructions';
