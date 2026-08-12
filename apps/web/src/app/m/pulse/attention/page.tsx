import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getTallySyncStats, lowStockAlerts } from "@nirman/services";
import {
  AlertTriangle, ClipboardCheck, Package, Truck, RefreshCw,
  CheckCircle2, ChevronRight, ArrowRight,
  TrendingDown, Building2,
} from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrencyCompact, formatNumber, formatDate } from "@/lib/utils";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";

/**
 * /m/pulse/attention — the "things that need you" drill-down.
 *
 * Purpose: an owner/manager opens this when the Pulse home shows
 * "N things need you". This page aggregates every alert across
 * the system into one prioritized list so they can triage:
 *
 *   1. Approvals — money can't move until these are approved
 *   2. Overdue POs — supplier deliveries are late, project at risk
 *   3. Low stock — production will stop if not reordered
 *   4. Cost overruns — projects bleeding money
 *   5. Tally pending — books not synced to accounting
 *
 * Each alert links to the right place to take action.
 * Sections are ordered by urgency: things that block money/work first.
 */
export default function AttentionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin" style={{ color: "var(--color-ink-300)" }} />
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
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        status: { in: ["ORDERED", "PARTIAL"] },
        expectedDate: { lt: new Date() },
      },
      orderBy: { expectedDate: "asc" },
      take: 20,
      include: { supplier: { select: { id: true, name: true } } },
    }),
    lowStockAlerts(company.id).catch(() => []),
    getTallySyncStats(company.id).catch(() => ({
      total: 0, synced: 0, failed: 0, pending: 0, imported: 0, variance: 0,
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
        id: true, name: true, status: true,
        totalBudget: true, totalProjectCost: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Filter to projects where actual > budget
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

  const now = Date.now();

  if (totalAlerts === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.625rem] border py-16 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div
          className="grid place-items-center size-12 rounded-full mb-3"
          style={{ backgroundColor: `color-mix(in srgb, var(--color-go) 10%, transparent)` }}
        >
          <CheckCircle2 className="size-6" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          All clear
        </p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          No approvals, overruns, or low stock. You&apos;re up to date.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* ── Summary banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-signal)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="grid place-items-center size-8 rounded-full shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, var(--color-signal) 12%, transparent)` }}
          >
            <AlertTriangle className="size-4" style={{ color: "var(--color-signal)" }} />
          </div>
          <div>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {totalAlerts} {totalAlerts === 1 ? "thing" : "things"} need you
            </p>
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              Triage by urgency below — approvals and overdues first
            </p>
          </div>
        </div>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          {approvalCount > 0 ? (
            <CategoryPill label="Approvals" count={approvalCount} color="var(--color-signal)" />
          ) : null}
          {overduePOs.length > 0 ? (
            <CategoryPill label="Overdue POs" count={overduePOs.length} color="var(--color-stop)" />
          ) : null}
          {lowStock.length > 0 ? (
            <CategoryPill label="Low stock" count={lowStock.length} color="var(--color-signal)" />
          ) : null}
          {overBudget.length > 0 ? (
            <CategoryPill label="Cost overruns" count={overBudget.length} color="var(--color-stop)" />
          ) : null}
          {tallyStats.pending > 0 ? (
            <CategoryPill label="Tally" count={tallyStats.pending} color="var(--color-steel)" />
          ) : null}
        </div>
      </div>

      {/* ── 1. Approvals — blocks money flow ── */}
      {approvalCount > 0 ? (
        <Section
          icon={<ClipboardCheck className="size-3" />}
          title="Approvals"
          subtitle="Waiting for your sign-off"
          count={approvalCount}
          color="var(--color-signal)"
        >
          {/* PO approvals */}
          {draftPOs.length > 0 ? (
            <div className="mb-2">
              <p className="text-[0.4375rem] font-bold uppercase tracking-wide mb-1.5 px-1" style={{ color: "var(--color-ink-500)" }}>
                Purchase Orders ({draftPOs.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {draftPOs.slice(0, 5).map((po) => (
                  <AlertCard
                    key={po.id}
                    href={`/m/procurement/${po.id}`}
                    title={po.supplier.name}
                    subtitle={`PO ${po.poNumber}`}
                    meta="Draft"
                    metaColor="var(--color-signal)"
                    icon={<ClipboardCheck className="size-3" />}
                  />
                ))}
                {draftPOs.length > 5 ? (
                  <Link
                    href="/m/pulse/approvals"
                    className="text-[0.5rem] font-semibold text-center py-1.5 press"
                    style={{ color: "var(--color-ink-600)" }}
                  >
                    +{draftPOs.length - 5} more draft POs
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Requisition approvals */}
          {pendingReqs.length > 0 ? (
            <div>
              <p className="text-[0.4375rem] font-bold uppercase tracking-wide mb-1.5 px-1" style={{ color: "var(--color-ink-500)" }}>
                Requisitions ({pendingReqs.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {pendingReqs.slice(0, 5).map((req) => (
                  <AlertCard
                    key={req.id}
                    href={`/m/requisitions/${req.id}`}
                    title={req.project?.name ?? "Requisition"}
                    subtitle={`Req ${req.reqNumber ?? req.id.slice(-6)}`}
                    meta="Submitted"
                    metaColor="var(--color-signal)"
                    icon={<ClipboardCheck className="size-3" />}
                  />
                ))}
                {pendingReqs.length > 5 ? (
                  <Link
                    href="/m/pulse/approvals"
                    className="text-[0.5rem] font-semibold text-center py-1.5 press"
                    style={{ color: "var(--color-ink-600)" }}
                  >
                    +{pendingReqs.length - 5} more requisitions
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Single link to full approvals page */}
          <Link
            href="/m/pulse/approvals"
            className="flex items-center justify-center gap-1 h-8 rounded-[0.5rem] text-[0.5625rem] font-bold press mt-2"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            Go to approvals queue
            <ArrowRight className="size-3" />
          </Link>
        </Section>
      ) : null}

      {/* ── 2. Overdue POs — supplier deliveries late ── */}
      {overduePOs.length > 0 ? (
        <Section
          icon={<Truck className="size-3" />}
          title="Overdue POs"
          subtitle="Supplier deliveries past expected date"
          count={overduePOs.length}
          color="var(--color-stop)"
        >
          <div className="flex flex-col gap-1.5">
            {overduePOs.slice(0, 10).map((po) => {
              const daysLate = po.expectedDate
                ? Math.floor((now - new Date(po.expectedDate).getTime()) / (24 * 60 * 60 * 1000))
                : 0;
              return (
                <AlertCard
                  key={po.id}
                  href={`/m/procurement/${po.id}`}
                  title={po.supplier.name}
                  subtitle={`PO ${po.poNumber} · expected ${po.expectedDate ? formatDate(po.expectedDate) : "—"}`}
                  meta={`${daysLate}d late`}
                  metaColor="var(--color-stop)"
                  icon={<Truck className="size-3" />}
                  borderAccent="var(--color-stop)"
                />
              );
            })}
            {overduePOs.length > 10 ? (
              <Link
                href="/m/procurement"
                className="text-[0.5rem] font-semibold text-center py-1.5 press"
                style={{ color: "var(--color-ink-600)" }}
              >
                +{overduePOs.length - 10} more overdue POs
              </Link>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* ── 3. Low stock — production at risk ── */}
      {lowStock.length > 0 ? (
        <Section
          icon={<Package className="size-3" />}
          title="Low Stock"
          subtitle="Materials at or below reorder point"
          count={lowStock.length}
          color="var(--color-signal)"
        >
          <div className="flex flex-col gap-1.5">
            {lowStock.slice(0, 10).map((m) => (
              <AlertCard
                key={m.materialId}
                href={`/m/materials/${m.materialId}`}
                title={m.name}
                subtitle={`${m.code} · reorder at ${formatNumber(toNum(m.reorderPoint), 2)} ${m.unit}`}
                meta={`${formatNumber(toNum(m.totalStock), 2)} ${m.unit}`}
                metaColor={m.isCritical ? "var(--color-stop)" : "var(--color-signal)"}
                icon={<Package className="size-3" />}
                borderAccent={m.isCritical ? "var(--color-stop)" : undefined}
              />
            ))}
            {lowStock.length > 10 ? (
              <Link
                href="/m/materials"
                className="text-[0.5rem] font-semibold text-center py-1.5 press"
                style={{ color: "var(--color-ink-600)" }}
              >
                +{lowStock.length - 10} more low-stock items
              </Link>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* ── 4. Cost overruns — projects bleeding money ── */}
      {overBudget.length > 0 ? (
        <Section
          icon={<TrendingDown className="size-3" />}
          title="Cost Overruns"
          subtitle="Projects where actual spend exceeds budget"
          count={overBudget.length}
          color="var(--color-stop)"
        >
          <div className="flex flex-col gap-1.5">
            {overBudget.slice(0, 10).map((p) => (
              <AlertCard
                key={p.id}
                href={`/m/projects/${p.id}`}
                title={p.name}
                subtitle={`${formatCurrencyCompact(p.cost)} spent · budget ${formatCurrencyCompact(p.budget)}`}
                meta={`+${formatNumber(p.overrunPct, 1)}%`}
                metaColor="var(--color-stop)"
                icon={<Building2 className="size-3" />}
                borderAccent="var(--color-stop)"
                extra={
                  <p className="text-[0.4375rem] font-semibold tabular-nums" style={{ color: "var(--color-stop)" }}>
                    {formatCurrencyCompact(p.overrun)} over budget
                  </p>
                }
              />
            ))}
            {overBudget.length > 10 ? (
              <Link
                href="/m/projects"
                className="text-[0.5rem] font-semibold text-center py-1.5 press"
                style={{ color: "var(--color-ink-600)" }}
              >
                +{overBudget.length - 10} more over budget
              </Link>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* ── 5. Tally pending — books not synced ── */}
      {tallyStats.pending > 0 ? (
        <Section
          icon={<RefreshCw className="size-3" />}
          title="Tally Pending"
          subtitle="Journal entries not yet synced to Tally"
          count={tallyStats.pending}
          color="var(--color-steel)"
        >
          <div className="mb-2">
            <TallySyncButton pendingCount={tallyStats.pending} />
          </div>
          <AlertCard
            href="/m/books/gl"
            title={`${tallyStats.pending} entries not synced`}
            subtitle={`${tallyStats.synced} synced · ${tallyStats.failed} failed`}
            meta="View GL"
            metaColor="var(--color-steel)"
            icon={<RefreshCw className="size-3" />}
          />
        </Section>
      ) : null}
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({
  icon, title, subtitle, count, color, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div
          className="grid place-items-center size-5 rounded shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.625rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
            {title} <span style={{ color }}>({count})</span>
          </p>
          <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Category pill ─── */
function CategoryPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="flex items-center gap-1 h-6 px-2 rounded-full text-[0.5rem] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      {label}
      <span className="text-[0.4375rem] tabular-nums" style={{ opacity: 0.7 }}>
        {count}
      </span>
    </span>
  );
}

/* ─── Alert card ─── */
function AlertCard({
  href, title, subtitle, meta, metaColor, icon, borderAccent, extra,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta: string;
  metaColor: string;
  icon: React.ReactNode;
  borderAccent?: string;
  extra?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{
        borderColor: borderAccent ?? "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div className="flex items-center gap-2 p-2.5">
        <div
          className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
          style={{ backgroundColor: "var(--color-paper-2)" }}
        >
          <span style={{ color: "var(--color-ink-500)" }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.6875rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {title}
          </p>
          <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
            {subtitle}
          </p>
          {extra}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: metaColor }}>
            {meta}
          </p>
          <ChevronRight className="size-3 ml-auto mt-0.5" style={{ color: "var(--color-ink-300)" }} />
        </div>
      </div>
    </Link>
  );
}
