import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/calls — call analytics.
 * Requires CALL_ANALYTICS.
 *
 * Query params:
 *   fromDate, toDate — date range (ISO strings, filters startedAt)
 *
 * Returns:
 *   - totalCalls
 *   - missedCount, missedRate
 *   - avgDurationSec
 *   - totalCost
 *   - callsPerStaff: [{ userId, name, count, totalDurationSec }]
 *   - dispositionDistribution: [{ disposition, count }]
 *   - directionDistribution: [{ direction, count }]
 *   - statusDistribution: [{ status, count }]
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.CALL_ANALYTICS);
  const company = await getCompany();

  const url = new URL(req.url);
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");

  const dateFilter: Record<string, unknown> = {};
  if (fromDate) dateFilter.gte = new Date(fromDate);
  if (toDate) dateFilter.lte = new Date(toDate);

  const where = {
    companyId: company.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 ? { startedAt: dateFilter } : {}),
  };

  // Aggregate counts by status, direction, disposition
  const [totalCalls, statusGroups, directionGroups, dispositionGroups, costSum, durationSum] = await Promise.all([
    prisma.callLog.count({ where }),
    prisma.callLog.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    prisma.callLog.groupBy({
      by: ["direction"],
      where,
      _count: true,
    }),
    prisma.callLog.groupBy({
      by: ["disposition"],
      where,
      _count: true,
    }),
    prisma.callLog.aggregate({
      where,
      _sum: { callCost: true },
    }),
    prisma.callLog.aggregate({
      where: { ...where, status: "ANSWERED" },
      _avg: { durationSec: true },
      _sum: { durationSec: true },
    }),
  ]);

  // Calls per staff (by callerUserId)
  const callsPerStaffRaw = await prisma.callLog.groupBy({
    by: ["callerUserId"],
    where: { ...where, callerUserId: { not: null } },
    _count: true,
    _sum: { durationSec: true },
  });

  // Fetch user names for the staff breakdown
  const userIds = callsPerStaffRaw.map((c) => c.callerUserId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const callsPerStaff = callsPerStaffRaw.map((c) => ({
    userId: c.callerUserId,
    name: userMap.get(c.callerUserId ?? "") ?? "Unknown",
    count: c._count,
    totalDurationSec: c._sum.durationSec ?? 0,
  }));

  // Calculate missed rate
  const missedCount = statusGroups.find((s) => s.status === "MISSED")?._count ?? 0;
  const missedRate = totalCalls > 0 ? (missedCount / totalCalls) * 100 : 0;

  return json({
    totalCalls,
    missedCount,
    missedRate: Math.round(missedRate * 100) / 100,
    avgDurationSec: Math.round(durationSum._avg.durationSec ?? 0),
    totalCost: toNum(costSum._sum.callCost),
    callsPerStaff,
    statusDistribution: statusGroups.map((s) => ({ status: s.status, count: s._count })),
    directionDistribution: directionGroups.map((d) => ({ direction: d.direction, count: d._count })),
    dispositionDistribution: dispositionGroups
      .filter((d) => d.disposition !== null)
      .map((d) => ({ disposition: d.disposition, count: d._count })),
  });
});
