import { Suspense } from "react";
import { connection } from "next/server";
import { runBookReconciliation } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { BooksHealthView } from "@/components/finance/books-health-view";

export const metadata = { title: "Books Health · Nirman" };
export const dynamic = "force-dynamic";

export default function BooksHealthPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Books Health"
        description="Five independent tie-outs that prove the operational ledgers (stock, land, units) agree with the general ledger — before the owner notices they don't."
      />
      <Suspense fallback={<PageLoading label="Running reconciliation checks…" />}>
        <BooksHealthContent />
      </Suspense>
    </div>
  );
}

export async function BooksHealthContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="the books health report" />;
  }

  const report = await runBookReconciliation(company.id);

  const checks = report.checks.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    expected: toNum(c.expected),
    actual: toNum(c.actual),
    delta: toNum(c.delta),
    tolerance: toNum(c.tolerance),
    message: c.message,
    details: c.details.map((d) => ({
      id: d.id,
      label: d.label,
      expected: toNum(d.expected),
      actual: toNum(d.actual),
      delta: toNum(d.delta),
    })),
  }));

  return (
    <BooksHealthView
      timestamp={report.timestamp}
      allPass={report.allPass}
      summary={report.summary}
      checks={checks}
    />
  );
}
