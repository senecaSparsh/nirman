import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/calls/export — CSV export of call logs.
 * Requires CALL_VIEW.
 *
 * Query params:
 *   fromDate, toDate — date range (ISO strings, filters startedAt)
 *   direction, status, staffId, companyPhoneId, tag, search — same filters as list
 *
 * Returns a CSV file with appropriate headers.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.CALL_VIEW);
  const company = await getCompany();

  const url = new URL(req.url);
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");
  const direction = url.searchParams.get("direction");
  const status = url.searchParams.get("status");
  const staffId = url.searchParams.get("staffId");
  const companyPhoneId = url.searchParams.get("companyPhoneId");
  const tag = url.searchParams.get("tag");
  const search = url.searchParams.get("search");

  // Permission scope
  const { getUserPermissions } = await import("@/lib/server");
  const perms = await getUserPermissions();
  const canViewAll = perms.includes(PERM.CALL_VIEW_ALL);

  const where: Record<string, unknown> = {
    companyId: company.id,
    deletedAt: null,
  };

  if (!canViewAll) {
    where.callerUserId = user.id;
  }

  if (direction) where.direction = direction;
  if (status) where.status = status;
  if (staffId) where.callerUserId = staffId;
  if (companyPhoneId) where.companyPhoneId = companyPhoneId;

  if (fromDate || toDate) {
    const startedAt: Record<string, unknown> = {};
    if (fromDate) startedAt.gte = new Date(fromDate);
    if (toDate) startedAt.lte = new Date(toDate);
    where.startedAt = startedAt;
  }

  if (search) {
    where.OR = [
      { fromNumber: { contains: search } },
      { toNumber: { contains: search } },
    ];
  }

  if (tag) {
    where.tags = { some: { callTag: { name: tag, companyId: company.id } } };
  }

  const calls = await prisma.callLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 10000, // safety limit
    include: {
      companyPhone: { select: { phoneNumber: true, label: true } },
      caller: { select: { name: true } },
      callee: { select: { name: true } },
      tags: { include: { callTag: { select: { name: true } } } },
    },
  });

  // Build CSV
  const headers = [
    "Call ID",
    "Direction",
    "From Number",
    "To Number",
    "Company Number",
    "Status",
    "Started At",
    "Connected At",
    "Ended At",
    "Duration (sec)",
    "Ring Duration (sec)",
    "Disposition",
    "Notes",
    "Caller",
    "Callee",
    "Call Cost",
    "Provider",
    "Source",
    "Legal Hold",
    "Tags",
  ];

  const escapeCsv = (val: unknown): string => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = calls.map((c) => [
    c.id,
    c.direction,
    c.fromNumber,
    c.toNumber,
    c.companyPhone?.phoneNumber ?? "",
    c.status,
    c.startedAt.toISOString(),
    c.connectedAt?.toISOString() ?? "",
    c.endedAt?.toISOString() ?? "",
    c.durationSec,
    c.ringDurationSec,
    c.disposition ?? "",
    c.notes ?? "",
    c.caller?.name ?? "",
    c.callee?.name ?? "",
    toNum(c.callCost).toFixed(2),
    c.provider ?? "",
    c.source,
    c.legalHold ? "Yes" : "No",
    c.tags.map((t) => t.callTag.name).join("; "),
  ].map(escapeCsv).join(","));

  const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calls-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
});
