import { NextRequest } from "next/server";
import { leaseExpiryAlerts } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/alerts/lease-expiry — lease expiry alerts for leasehold land.
 * Returns land purchases where the lease end date is within 90 days or expired.
 * Also emits LEASE_EXPIRY_WARNING notification events.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_VIEW);
  const alerts = await leaseExpiryAlerts(user.companyId ?? undefined);
  return json({ alerts });
});
