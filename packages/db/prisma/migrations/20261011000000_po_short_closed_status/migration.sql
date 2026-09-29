-- AlterEnum — add SHORT_CLOSED for a purchase order that received a partial
-- delivery and is closed for the shortfall (supplier can't supply the rest).
ALTER TYPE "public"."PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'SHORT_CLOSED';
