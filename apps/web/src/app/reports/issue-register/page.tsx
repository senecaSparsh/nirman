import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { IssueRegisterReport } from "@/components/reports/issue-register-report";

import { NoAccess } from "@/components/no-access";

/**
 * Stock Issue Register — a digital version of the client's paper register
 * that lists one row per stock issue slip in a period. Matches the paper
 * "Stock Issue Register" columns: SrNo, Number, Date, Name, Round, Bill Amt.
 */
export default function IssueRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading issue register…" variant="list" />}>
        <IssueRegisterContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function IssueRegisterContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="the stock issue register" />;
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const dateFilter = {
    issueDate: { gte: fromDate, lte: toDate },
  };

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

  const report = {
    from,
    to,
    rows,
    count: rows.length,
    totalAmount,
    totalRound,
  };

  return (
    <>
      <PageHeader
        title="Stock Issue Register"
        description="Every stock issue slip in the period — one row per issue with its number, date, recipient, and bill amount. A digital version of the paper Stock Issue Register."
        stats={[
          { label: "Issues", value: report.count },
          { label: "Total round-off", value: formatCurrency(totalRound) },
          { label: "Total amount", value: formatCurrency(totalAmount) },
        ]}
      />
      <IssueRegisterReport report={report} />
    </>
  );
}
