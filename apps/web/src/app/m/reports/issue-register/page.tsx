import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { ClipboardList, FileText } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/issue-register — mobile stock issue register.
 * Lists one row per stock issue slip in the current financial year — a digital
 * version of the paper Stock Issue Register.
 */
export default function MobileIssueRegisterPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileIssueRegisterContent />
    </Suspense>
  );
}

async function MobileIssueRegisterContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) notFound();
  const company = await getCompany();

  // Current financial year (Apr 1 → now)
  const now = new Date();
  const fromDate = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  const issues = await prisma.materialIssue.findMany({
    where: {
      OR: [
        { department: { companyId: company.id, deletedAt: null } },
        { project: { companyId: company.id, deletedAt: null } },
      ],
      issueDate: { gte: fromDate, lte: toDate },
    },
    include: {
      department: { select: { code: true, name: true } },
      project: { select: { name: true } },
      issuedBy: { select: { name: true } },
      lines: { select: { qty: true } },
    },
    orderBy: { issueDate: "asc" },
  });

  const records = issues.map((issue) => {
    const isProject = !!issue.project;
    const targetName =
      issue.project?.name ??
      (issue.department ? `${issue.department.code} — ${issue.department.name}` : "—");
    const totalQty = issue.lines.reduce((s, l) => s + toNum(l.qty), 0);
    return {
      id: issue.id,
      number: issue.issueNumber ?? "—",
      date: issue.issueDate.toISOString(),
      name: targetName,
      recipientType: isProject ? "Project" : "Department",
      issuedByName: issue.issuedBy?.name ?? "—",
      recipientName: targetName,
      projectName: issue.project?.name ?? "—",
      totalQty,
      round: toNum(issue.roundOff),
      billAmt: toNum(issue.totalAmount),
    };
  });

  const totalAmount = records.reduce((s, r) => s + r.billAmt, 0);
  const totalRound = records.reduce((s, r) => s + r.round, 0);
  const totalQty = records.reduce((s, r) => s + r.totalQty, 0);

  if (records.length === 0) {
    return (
      <MobileEmptyState
        icon={ClipboardList}
        title="No stock issues this year"
        hint="Material issues for the current financial year will appear here"
      />
    );
  }

  // Aggregate issue value by project/department for the bar chart
  const byTarget = new Map<string, number>();
  for (const r of records) {
    byTarget.set(r.name, (byTarget.get(r.name) ?? 0) + r.billAmt);
  }
  const chartData = Array.from(byTarget.entries()).map(([label, value]) => ({
    label,
    value,
    tone: "go" as const,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "number", label: "Issue Number" },
    { key: "date", label: "Date", format: "date" },
    { key: "projectName", label: "Project / Department" },
    { key: "issuedByName", label: "Issued By" },
    { key: "recipientName", label: "Recipient" },
    { key: "recipientType", label: "Recipient Type" },
    { key: "totalQty", label: "Total Qty", format: "number" },
    { key: "billAmt", label: "Total Value", format: "currency" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Issue Register"
        subtitle="Stock issue slips for the current financial year"
        icon={FileText}
        period="FY 2025-26"
      />

      <MobileReportSummary
        items={[
          { label: "Total Issues", value: String(records.length) },
          { label: "Total Value", value: formatCurrency(totalAmount), tone: "go" },
          { label: "Total Qty", value: String(totalQty), tone: "signal" },
          { label: "Round-Off", value: formatCurrency(totalRound) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Issue Register Report"
          rows={records as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Issues: ${records.length} · Value: ${formatCurrency(totalAmount)} · Qty: ${totalQty}`}
        />
      </div>

      {/* Issues by project — bar chart */}
      <MobileSectionTitle>Issues by Project / Department</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={chartData}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Issue list */}
      <MobileSectionTitle>Issues</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {records.slice(0, 30).map((r) => (
          <MobileRow
            key={r.id}
            icon={ClipboardList}
            title={r.name}
            subtitle={`${r.number} · ${formatDate(r.date)}`}
            meta={formatCurrency(r.billAmt)}
            metaSub={r.round !== 0 ? `Round ${formatCurrency(r.round)}` : undefined}
            tone="success"
          />
        ))}
        {records.length > 30 && (
          <p className="text-center text-[0.625rem] py-2" style={{ color: "var(--color-ink-500)" }}>
            Showing 30 of {records.length} issues
          </p>
        )}
      </div>
    </div>
  );
}
