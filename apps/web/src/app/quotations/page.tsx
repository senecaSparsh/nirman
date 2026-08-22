import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getCurrentUserMembership, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, FileText, Trophy, ChevronRight, AlertCircle, Check } from "lucide-react";

export default function QuotationsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading quotations…" />}>
        <QuotationsContent />
      </Suspense>
    </div>
  );
}

async function QuotationsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.QUOTATION_VIEW)) {
    return <NoAccess what="quotations" />;
  }

  const canCreate = hasPermission(role, PERM.QUOTATION_MANAGE);
  const membership = await getCurrentUserMembership();

  const [requests, directReports] = await Promise.all([
    prisma.quotationRequest.findMany({
      where: { companyId: company.id },
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
          where: { reportsToUserCompanyId: membership.id },
          select: { id: true },
        })
      : [],
  ]);

  const reportIds = new Set(directReports.map((r) => r.id));

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Collect supplier quotes, compare per-piece landed cost, and approve the winner"
        action={
          canCreate ? (
            <Link
              href="/m/quotations?new=1"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              <Plus className="size-4" />
              New Request
            </Link>
          ) : null
        }
      />

      {/* Info banner */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Quotation requests are created and managed on mobile (the site team collects quotes from suppliers).
          This desktop page gives you an overview. Approval is done by the submitter&apos;s direct reporting manager.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 font-semibold">No quotation requests yet</p>
          <p className="text-sm text-muted-foreground">
            {canCreate ? "Create one from the mobile app to get started." : "Quotation requests will appear here once created."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Request</th>
                <th className="text-left px-4 py-3 font-semibold">Project</th>
                <th className="text-left px-4 py-3 font-semibold">Submitted by</th>
                <th className="text-center px-4 py-3 font-semibold">Quotes</th>
                <th className="text-right px-4 py-3 font-semibold">Cheapest</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => {
                const quotes = r.quotes;
                const cheapest = quotes.find((q) => q.isCheapest);
                const quotesMet = quotes.length >= r.minQuotesRequired;
                const isPendingMyApproval = reportIds.has(r.submittedByUserCompanyId);
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/m/quotations?open=${r.id}`} className="block">
                        <p className="font-mono text-xs font-bold">{r.requestNumber}</p>
                        <p className="font-medium truncate max-w-[20rem]">{r.title}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.project?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.submittedBy?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${quotesMet ? "text-green-600" : "text-amber-600"}`}>
                        {quotesMet ? <Check className="size-3" /> : <AlertCircle className="size-3" />}
                        {quotes.length}/{r.minQuotesRequired}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {cheapest ? (
                        <span className="flex items-center justify-end gap-1 font-semibold text-green-600">
                          <Trophy className="size-3" />
                          {formatCurrency(toNum(cheapest.landedTotal))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {isPendingMyApproval ? (
                          <span className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            Your approval
                          </span>
                        ) : null}
                        {r.convertedPo ? (
                          <Link href={`/m/procurement/${r.convertedPo.id}`} className="text-xs font-bold text-green-700">
                            {r.convertedPo.poNumber}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/m/quotations?open=${r.id}`}>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-gray-100 text-gray-700",
    QUOTES_COLLECTED: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-500",
    CANCELLED: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    OPEN: "Open",
    QUOTES_COLLECTED: "Quotes In",
    APPROVED: "Approved",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${styles[status] ?? styles.OPEN}`}>
      {labels[status] ?? status}
    </span>
  );
}
