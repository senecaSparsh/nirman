import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

// /m/alerts has no index — redirect to the lease-expiry alert list, the only
// alert surface. Prevents a bare 404 if someone lands on /m/alerts directly.
export default async function MobileAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/alerts/lease-expiry", params));
}
