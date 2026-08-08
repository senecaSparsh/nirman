import { NextRequest } from "next/server";
import { listNotificationLogs } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/notifications/log?eventType=LOW_STOCK&status=SENT&limit=50
 * Get the notification log for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get("eventType") ?? undefined;
  const status = searchParams.get("status") as "PENDING" | "SENT" | "FAILED" | null;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

  const logs = await listNotificationLogs(company.id, {
    eventType,
    status: status ?? undefined,
    limit,
  });

  return json({ rows: logs });
});
