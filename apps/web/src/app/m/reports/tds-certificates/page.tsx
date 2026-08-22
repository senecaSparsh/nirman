import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { listTdsSubcontractors } from "@nirman/services";
import { FileText, Receipt, Users } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStart = month < 3 ? year - 1 : year;
  const fyEnd = (fyStart + 1).toString().slice(2);
  return `${fyStart}-${fyEnd}`;
}

/**
 * /m/reports/tds-certificates — mobile TDS certificates report.
 * Lists subcontractors with TDS deducted in the financial year.
 */
export default function MobileTdsCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={4} />}>
      <MobileTdsCertificatesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileTdsCertificatesContent({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  await connection();
  const { fy: fyParam } = await searchParams;
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const fy = fyParam ?? currentFY();

  const list = await listTdsSubcontractors(fy, company.id);

  if (list.length === 0) {
    return <MobileEmptyState icon={Receipt} title={`No TDS for FY ${fy}`} hint="Subcontractors with TDS deductions will appear here" />;
  }

  const totalGross = list.reduce((s, r) => s + Number(r.totalGross), 0);
  const totalTds = list.reduce((s, r) => s + Number(r.totalTds), 0);
  const totalBills = list.reduce((s, r) => s + r.billCount, 0);

  const csvColumns: MobileColumnSpec[] = [
    { key: "subcontractorName", label: "Subcontractor" },
    { key: "trade", label: "Trade" },
    { key: "pan", label: "PAN" },
    { key: "billCount", label: "Bills" },
    { key: "totalGross", label: "Total Gross", format: "currency" },
    { key: "totalTds", label: "Total TDS", format: "currency" },
  ];

  const csvRows = list.map((r) => ({
    subcontractorName: r.subcontractorName,
    trade: r.trade,
    pan: r.pan,
    billCount: r.billCount,
    totalGross: Number(r.totalGross),
    totalTds: Number(r.totalTds),
  }));

  return (
    <div>
      <MobileReportHeader
        title="TDS Certificates"
        subtitle="TDS deducted from subcontractor bills"
        icon={FileText}
        period={`FY ${fy}`}
      />

      <MobileReportSummary
        items={[
          { label: "Total Gross", value: formatCurrency(totalGross) },
          { label: "Total TDS", value: formatCurrency(totalTds), tone: "stop" },
          { label: "Subcontractors", value: String(list.length) },
          { label: "Bills", value: String(totalBills) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="TDS Certificates Report"
          rows={csvRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`FY ${fy} · Subcontractors: ${list.length} · Bills: ${totalBills} · Gross: ${formatCurrency(totalGross)} · TDS: ${formatCurrency(totalTds)}`}
        />
      </div>

      {/* TDS by subcontractor — bar chart */}
      <MobileSectionTitle>TDS by Subcontractor</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={list.map((r) => ({
            label: r.subcontractorName,
            value: Number(r.totalTds),
            tone: "stop" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* By subcontractor */}
      <MobileSectionTitle>By Subcontractor (FY {fy})</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {list.map((r) => (
          <MobileRow
            key={r.subcontractorId}
            icon={Users}
            title={r.subcontractorName}
            subtitle={`${r.trade ?? "—"} · PAN ${r.pan ?? "—"} · ${r.billCount} bill${r.billCount !== 1 ? "s" : ""}`}
            meta={formatCurrency(Number(r.totalTds))}
            metaSub={`Gross ${formatCurrency(Number(r.totalGross))}`}
            tone="danger"
          />
        ))}
      </div>
    </div>
  );
}
