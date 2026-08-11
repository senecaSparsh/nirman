import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getTallySyncStats, lowStockAlerts } from "@nirman/services";
import {
  AlertTriangle,
  ClipboardCheck,
  Package,
  Truck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";

/**
 * Attention drill-down — all alerts in one place.
 *
 * Sections (each only renders if it has items):
 * 1. Approvals (draft POs + submitted requisitions)
 * 2. Overdue POs (ordered/partial past expectedDate)
 * 3. Low stock (materials at/below reorder point)
 * 4. Cost overruns (projects where actual > budget)
 * 5. Tally pending (journal entries not yet synced)
 *
 * Each row links to the relevant mobile page for action.
 */
export default function AttentionPage() {
  return (
    <Suspense
      fallback={
        <div>
          <MobilePageHeader title="Attention" right={<MobileRefreshButton />} />
          <MobileEmptyState icon={RefreshCw} title="Loading…" />
        </div>
      }
    >
      <AttentionContent />
    </Suspense>
  );
}

async function AttentionContent() {
  await connection();
  const company = await getCompany();

  const [
    draftPOs,
    pendingReqs,
    overduePOs,
    lowStock,
    tallyStats,
    overBudgetProjects,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { project: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        status: { in: ["ORDERED", "PARTIAL"] },
        expectedDate: { lt: new Date() },
      },
      orderBy: { expectedDate: "asc" },
      take: 20,
      include: { supplier: { select: { name: true } } },
    }),
    lowStockAlerts(company.id).catch(() => []),
    getTallySyncStats(company.id).catch(() => ({
      total: 0,
      synced: 0,
      failed: 0,
      pending: 0,
      imported: 0,
      variance: 0,
    })),
    prisma.project.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        status: { in: ["PLANNED", "ACTIVE"] },
        totalBudget: { gt: 0 },
        totalProjectCost: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        status: true,
        totalBudget: true,
        totalProjectCost: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Filter to projects where actual > budget (overrun)
  const overBudget = overBudgetProjects
    .map((p) => {
      const budget = toNum(p.totalBudget);
      const cost = toNum(p.totalProjectCost);
      const overrun = cost - budget;
      const overrunPct = budget > 0 ? (overrun / budget) * 100 : 0;
      return { ...p, budget, cost, overrun, overrunPct };
    })
    .filter((p) => p.overrun > 0)
    .sort((a, b) => b.overrun - a.overrun);

  const approvalCount = draftPOs.length + pendingReqs.length;
  const totalAlerts =
    approvalCount + overduePOs.length + lowStock.length + overBudget.length + tallyStats.pending;

  return (
    <div>
      <MobilePageHeader
        title="Attention"
        subtitle={
          totalAlerts > 0
            ? `${totalAlerts} things need you`
            : "Everything is in order"
        }
        right={<MobileRefreshButton />}
      />

      {totalAlerts === 0 && (
        <MobileEmptyState
          icon={CheckCircle2}
          title="All clear"
          hint="No approvals, overruns, or low stock. You're up to date."
        />
      )}

      {/* ── Approvals ──────────────────────────────────────────── */}
      {approvalCount > 0 && (
        <>
          <MobileSectionTitle>
            Approvals ({approvalCount})
          </MobileSectionTitle>
          <div>
            <MobileRow
              href="/m/pulse/approvals"
              icon={ClipboardCheck}
              title={`${approvalCount} items waiting`}
              subtitle={`${draftPOs.length} POs · ${pendingReqs.length} requisitions`}
              meta="Review"
              tone="warning"
            />
          </div>
        </>
      )}

      {/* ── Overdue POs ────────────────────────────────────────── */}
      {overduePOs.length > 0 && (
        <>
          <MobileSectionTitle>
            Overdue POs ({overduePOs.length})
          </MobileSectionTitle>
          <div>
            {overduePOs.map((po) => (
              <MobileRow
                key={po.id}
                href="/m/procurement"
                icon={Truck}
                title={po.supplier.name}
                subtitle={`PO ${po.poNumber} · expected ${formatDate(po.expectedDate)}`}
                meta="overdue"
                tone="danger"
              />
            ))}
          </div>
        </>
      )}

      {/* ── Low stock ──────────────────────────────────────────── */}
      {lowStock.length > 0 && (
        <>
          <MobileSectionTitle>
            Low stock ({lowStock.length})
          </MobileSectionTitle>
          <div>
            {lowStock.slice(0, 15).map((m) => (
              <MobileRow
                key={m.materialId}
                href="/m/materials"
                icon={Package}
                title={m.name}
                subtitle={`${m.code} · reorder at ${formatNumber(toNum(m.reorderPoint), 2)} ${m.unit}`}
                meta={`${formatNumber(toNum(m.totalStock), 2)} ${m.unit}`}
                tone={m.isCritical ? "danger" : "warning"}
              />
            ))}
            {lowStock.length > 15 && (
              <MobileRow
                href="/m/materials"
                title={`${lowStock.length - 15} more low-stock items`}
                subtitle="View all materials"
              />
            )}
          </div>
        </>
      )}

      {/* ── Cost overruns ──────────────────────────────────────── */}
      {overBudget.length > 0 && (
        <>
          <MobileSectionTitle>
            Cost overruns ({overBudget.length})
          </MobileSectionTitle>
          <div>
            {overBudget.slice(0, 10).map((p) => (
              <MobileRow
                key={p.id}
                href="/m/projects"
                icon={AlertTriangle}
                title={p.name}
                subtitle={`${formatCurrency(p.cost)} spent · budget ${formatCurrency(p.budget)}`}
                meta={`+${formatNumber(p.overrunPct, 1)}%`}
                tone="danger"
                badge={<MobileStatusBadge status={p.status} />}
              />
            ))}
            {overBudget.length > 10 && (
              <MobileRow
                href="/m/pulse/projects"
                title={`${overBudget.length - 10} more over budget`}
                subtitle="View all projects"
              />
            )}
          </div>
        </>
      )}

      {/* ── Tally pending ──────────────────────────────────────── */}
      {tallyStats.pending > 0 && (
        <>
          <MobileSectionTitle>
            Tally pending ({tallyStats.pending})
          </MobileSectionTitle>
          <div className="px-4 py-2">
            <TallySyncButton pendingCount={tallyStats.pending} />
          </div>
          <div>
            <MobileRow
              href="/m/books/gl"
              icon={RefreshCw}
              title={`${tallyStats.pending} entries not synced`}
              subtitle={`${tallyStats.synced} synced · ${tallyStats.failed} failed`}
              meta="Sync now"
              tone="warning"
            />
          </div>
        </>
      )}

      <div className="h-4" />
    </div>
  );
}
