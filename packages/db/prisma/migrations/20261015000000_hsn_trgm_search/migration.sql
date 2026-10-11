-- Trigram indexes for the HSN/GST code search.
--
-- /api/hsn (used by the invoice/quotation HSN pickers) filters with
-- `contains` + `insensitive` → `ILIKE '%q%'` on hsnCode + description.
-- A substring ILIKE can't use a B-tree index, so every keystroke was a
-- sequential scan over the ~13k-row HsnGstRate reference table. A pg_trgm
-- GIN index makes substring search index-assisted instead.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "HsnGstRate_hsnCode_trgm_idx"
  ON "public"."HsnGstRate" USING gin ("hsnCode" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "HsnGstRate_description_trgm_idx"
  ON "public"."HsnGstRate" USING gin ("description" gin_trgm_ops);
