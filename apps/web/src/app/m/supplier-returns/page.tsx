import { redirect } from "next/navigation";

/**
 * /m/supplier-returns — redirects to the unified procurement hub.
 * Supplier Returns are now a tab within /m/procurement.
 */
export default function MobileSupplierReturnsPage() {
  redirect("/m/procurement?tab=returns");
}
