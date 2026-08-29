-- pg_trgm trigram indexes for fast substring (ILIKE) search.
--
-- The search API (/api/search) and various list endpoints use
-- `contains: q, mode: "insensitive"` which compiles to ILIKE '%q%'.
-- Without trigram indexes, ILIKE does a full-table scan on every query.
-- With pg_trgm + GIN indexes, Postgres can answer ILIKE in O(log n).
--
-- Run this ONCE per database after `prisma db push`:
--   psql -d nirman_inventory -f packages/db/prisma/sql/pg_trgm_search_indexes.sql
--   psql -d nirman_inventory_test -f packages/db/prisma/sql/pg_trgm_search_indexes.sql
--
-- The extension is safe to CREATE IF NOT EXISTS — it's idempotent.

-- 1. Enable the pg_trgm extension (requires superuser or the extension
--    to be pre-installed by the DB admin).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes on the most-searched text columns.
--    GIN (not GiST) is the right choice for read-heavy workloads —
--    faster lookups, slower writes. Writes are infrequent compared to
--    searches, so GIN wins.

-- Materials — searched by name + code in the command palette + pickers
CREATE INDEX IF NOT EXISTS trgm_material_name ON "Material" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_material_code ON "Material" USING gin (code gin_trgm_ops);

-- Suppliers — searched by name, gstin, phone
CREATE INDEX IF NOT EXISTS trgm_supplier_name ON "Supplier" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_supplier_gstin ON "Supplier" USING gin (gstin gin_trgm_ops);

-- Customers — searched by name, phone, email
CREATE INDEX IF NOT EXISTS trgm_customer_name ON "Customer" USING gin (name gin_trgm_ops);

-- Projects — searched by name
CREATE INDEX IF NOT EXISTS trgm_project_name ON "Project" USING gin (name gin_trgm_ops);

-- Stock locations — searched by name
CREATE INDEX IF NOT EXISTS trgm_stock_location_name ON "StockLocation" USING gin (name gin_trgm_ops);

-- Users — searched by name, email
CREATE INDEX IF NOT EXISTS trgm_user_name ON "User" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_user_email ON "User" USING gin (email gin_trgm_ops);

-- Leads — searched by name, phone
CREATE INDEX IF NOT EXISTS trgm_lead_name ON "Lead" USING gin (name gin_trgm_ops);

-- Purchase orders — searched by poNumber
CREATE INDEX IF NOT EXISTS trgm_po_number ON "PurchaseOrder" USING gin ("poNumber" gin_trgm_ops);

-- Material requisitions — searched by reqNumber
CREATE INDEX IF NOT EXISTS trgm_req_number ON "MaterialRequisition" USING gin ("reqNumber" gin_trgm_ops);

-- Stock transfers — searched by from/to location name (join-side, but
-- the location names themselves benefit from trigram)
-- (StockLocation.name already indexed above)

-- Vehicles — searched by vehicle number
CREATE INDEX IF NOT EXISTS trgm_vehicle_number ON "Vehicle" USING gin ("vehicleNumber" gin_trgm_ops);

-- Gate passes — searched by gatePassNumber
CREATE INDEX IF NOT EXISTS trgm_gate_pass_number ON "GatePass" USING gin ("gatePassNumber" gin_trgm_ops);
