-- Hard floor: stock can never go negative. All service paths already guard
-- at the application layer (issue/transfer/adjustment/return check available
-- qty under serializable transactions) — this constraint is the database
-- backstop so a direct write, migration script, or future path can't
-- violate the invariant silently.
ALTER TABLE "StockLocationItem" ADD CONSTRAINT "StockLocationItem_qty_nonneg" CHECK (qty >= 0);
