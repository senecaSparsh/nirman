import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getCurrentUserMembership, toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { QuotationsTab } from "@/components/procurement/procurement-view";
import type { QuotationRequestRow } from "@/lib/types";

export const metadata = { title: "Quotations · Nirman" };

/**
 * Standalone Quotations page — accessible by any role with QUOTATION_VIEW.
 * Previously this redirected to /procurement?tab=quotations, which locked
 * out SALES_MANAGER (who has QUOTATION_VIEW/QUOTATION_MANAGE but not
 * PROCUREMENT_VIEW). Now it loads quotation data directly.
 */
export default function QuotationsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading quotations…" variant="default" />}>
        <QuotationsContent />
      </Suspense>
    </div>
  );
}

async function QuotationsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const membership = await getCurrentUserMembership();

  if (!hasPermission(role, PERM.QUOTATION_VIEW)) {
    return <NoAccess what="quotations" />;
  }

  const [quotationRequests, directReports] = await Promise.all([
    prisma.quotationRequest.findMany({
      where: { companyId: company.id, ...await scopeWhere("QuotationRequest") },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        lines: { select: { id: true } },
        quotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, status: true, isCheapest: true },
        },
        convertedPo: { select: { id: true, poNumber: true, status: true } },
      },
    }),
    membership
      ? prisma.userCompany.findMany({
          take: 200,
          where: { reportsToUserCompanyId: membership.id, user: { isHidden: { not: true } } },
          select: { id: true },
        })
      : [],
  ]);

  const reportIds = new Set(directReports.map((r) => r.id));
  const quotationRequestRows: QuotationRequestRow[] = quotationRequests.map((r) => {
    const cheapest = r.quotes.find((q) => q.isCheapest);
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      title: r.title,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      workActivity: r.workActivity ?? null,
      requiredByDate: r.requiredByDate?.toISOString() ?? null,
      submittedByUserCompanyId: r.submittedByUserCompanyId,
      submittedByName: r.submittedBy?.name ?? null,
      status: r.status,
      minQuotesRequired: r.minQuotesRequired,
      quoteCount: r.quotes.length,
      cheapestLandedTotal: cheapest ? toNum(cheapest.landedTotal) : null,
      convertedPoId: r.convertedPo?.id ?? null,
      convertedPoNumber: r.convertedPo?.poNumber ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const pendingCount = quotationRequestRows.filter((r) => r.status === "OPEN" || r.status === "QUOTING").length;
  const readyCount = quotationRequestRows.filter((r) => r.status === "QUOTED" && !r.convertedPoId).length;

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Request quotes from suppliers, compare landed costs, and convert the winner into a purchase order."
        stats={[
          { label: "Requests", value: quotationRequestRows.length },
          { label: "Pending", value: pendingCount, tone: pendingCount > 0 ? "warning" : "muted" },
          { label: "Ready to convert", value: readyCount, tone: readyCount > 0 ? "success" : "muted" },
        ]}
        action={<RefreshButton />}
      />
      <QuotationsTab requests={quotationRequestRows} reportIds={reportIds} />
    </>
  );
}
