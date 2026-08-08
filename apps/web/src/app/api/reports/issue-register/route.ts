import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/issue-register?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Stock Issue Register — a digital version of the client's paper register
 * that lists one row per stock issue slip in a period. Columns match the
 * paper format: SrNo, Number, Date, Name (department/project), Round, Bill Amt.
 * Only counts issues for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
  if (from) dateFilter.issueDate = { ...dateFilter.issueDate, gte: new Date(from) };
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.issueDate = { ...dateFilter.issueDate, lte: end };
  }

  const issues = await prisma.materialIssue.findMany({
    where: {
      OR: [
        { department: { companyId: company.id, deletedAt: null } },
        { project: { companyId: company.id, deletedAt: null } },
      ],
      ...dateFilter,
    },
    include: {
      department: { select: { code: true, name: true } },
      project: { select: { name: true } },
    },
    orderBy: { issueDate: "asc" },
  });

  const rows = issues.map((issue, i) => {
    const targetName = issue.project?.name
      ?? (issue.department ? `${issue.department.code} — ${issue.department.name}` : "—");
    return {
      srNo: i + 1,
      id: issue.id,
      number: issue.issueNumber ?? "—",
      date: issue.issueDate.toISOString().slice(0, 10),
      name: targetName,
      round: toNum(issue.roundOff),
      billAmt: toNum(issue.totalAmount),
    };
  });

  const totalAmount = rows.reduce((s, r) => s + r.billAmt, 0);
  const totalRound = rows.reduce((s, r) => s + r.round, 0);

  return json({
    from: from ?? null,
    to: to ?? null,
    rows,
    count: rows.length,
    totalAmount,
    totalRound,
  });
});
