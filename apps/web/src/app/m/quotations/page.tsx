import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/**
 * /m/quotations — redirects to the unified procurement hub.
 * Quotation Requests are now a tab within /m/procurement.
 */
export default async function MobileQuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/procurement?tab=quotations", params));
}
