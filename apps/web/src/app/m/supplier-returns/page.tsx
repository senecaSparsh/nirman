import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/**
 * /m/supplier-returns — redirects to the unified procurement hub.
 * Supplier Returns are now a tab within /m/procurement.
 */
export default async function MobileSupplierReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/procurement?tab=returns", params));
}
