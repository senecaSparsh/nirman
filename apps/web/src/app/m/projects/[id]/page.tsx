import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Building2, Home, ClipboardList,
  MapPin, Calendar, TrendingUp, PackageCheck,
  FileText,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";

/**
 * /m/projects/[id] — project detail page.
 *
 * Layout:
 *   1. Back button + status badge
 *   2. Hero card — project name, type, address, key financials
 *   3. Attention banner — project-specific alerts
 *   4. KPI strip — units, sold, cost, cost/sqft
 *   5. Budget & timeline details
 *   6. Units grid (2-col cards)
 *   7. Recent POs / Issues / Costs / DPRs
 */
export default function MobileProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProjectDetailContent params={params} />
    </Suspense>
  );
}

async function MobileProjectDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });

  if (!project) {
    return (
      <div>
        <div className="mb-4">
          <MobileBackButton fallback="/m/projects" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <MobileEmptyState icon={Building2} title="Project not found" />
      </div>
    );
  }

  const [units, recentPOs, recentIssues, recentCosts, recentDprs, requisitions, landParcels] =
    await Promise.all([
      prisma.builtUnit.findMany({
        where: { projectId: id, deletedAt: null },
        orderBy: { unitNumber: "asc" },
        select: {
          id: true, unitNumber: true, unitType: true, status: true,
          area: true, areaUnit: true, floor: true, wing: true,
          askingPrice: true, productionCost: true, saleId: true,
        },
      }),
      prisma.purchaseOrder.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { supplier: { select: { name: true } } },
      }),
      prisma.materialIssue.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { fromLocation: { select: { name: true } } },
      }),
      prisma.projectCost.findMany({
        where: { projectId: id },
        orderBy: { date: "desc" },
        take: 5,
        select: { id: true, costType: true, amount: true, date: true, vendor: true },
      }),
      prisma.dailyProgressReport.findMany({
        where: { projectId: id },
        orderBy: { date: "desc" },
        take: 5,
        select: { id: true, date: true, approvalStatus: true, progressPct: true, workSummary: true },
      }),
      prisma.materialRequisition.count({
        where: { projectId: id, status: "SUBMITTED" },
      }),
      prisma.landParcel.count({
        where: { projectId: id, deletedAt: null, status: "AVAILABLE" },
      }),
    ]);

  const availableUnits = units.filter((u) => u.status === "AVAILABLE" || u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION");
  const soldUnits = units.filter((u) => u.saleId != null);
  const totalProjectCost = project.totalProjectCost ? toNum(project.totalProjectCost) : 0;
  const totalBudget = project.totalBudget ? toNum(project.totalBudget) : 0;
  const budgetUsedPct = totalBudget > 0 ? Math.min(100, (totalProjectCost / totalBudget) * 100) : 0;
  const isOverBudget = totalBudget > 0 && totalProjectCost > totalBudget;

  // ── Build attention banners ──
  // Only cross-entity alerts — status & budget are already in the hero card
  const attentionBanners: AttentionBanner[] = [];

  if (requisitions > 0) {
    attentionBanners.push({
      id: "pending-reqs",
      title: `${requisitions} requisition${requisitions !== 1 ? "s" : ""} pending approval`,
      subtitle: `Material requests for this project awaiting review`,
      href: "/m/requisitions",
      severity: "low",
      qtyText: String(requisitions),
      category: "Approvals",
    });
  }

  // Pending DPRs
  const pendingDprs = recentDprs.filter((d) => d.approvalStatus === "SUBMITTED" || d.approvalStatus === "SUB_ADMIN_APPROVED");
  for (const dpr of pendingDprs) {
    attentionBanners.push({
      id: dpr.id,
      title: `DPR ${formatDate(dpr.date)}`,
      subtitle: `${dpr.approvalStatus} · ${dpr.workSummary?.slice(0, 50) ?? "awaiting approval"}`,
      href: `/m/dprs/${dpr.id}`,
      severity: "low",
      qtyText: dpr.approvalStatus === "SUBMITTED" ? "New" : "Sub",
      category: "DPR",
    });
  }

  // Units under construction with no asking price
  for (const u of units.filter((u) => u.status === "UNDER_CONSTRUCTION" && !u.askingPrice).slice(0, 2)) {
    attentionBanners.push({
      id: `no-price-${u.id}`,
      title: `Unit ${u.unitNumber} — no asking price`,
      subtitle: `Under construction · ${formatNumber(toNum(u.area), 0)} ${u.areaUnit} · set a price to list`,
      href: `/m/units/${u.id}`,
      severity: "low",
      qtyText: "—",
      category: "Unit",
    });
  }

  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${availableUnits.length} available · ${soldUnits.length} sold · ${formatCurrency(totalProjectCost)} spent · on track`,
      href: `/m/projects/${id}`,
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  const typeLabel = project.type.replace(/_/g, " ");

  return (
    <div>
      {/* ── Back + status ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <MobileBackButton fallback="/m/projects" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
        <MobileStatusBadge status={project.status} />
      </div>

      {/* ── Hero card ── */}
      <div
        className="rounded-[0.875rem] border p-3.5 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="grid place-items-center w-11 h-11 rounded-[0.625rem] shrink-0 text-[1.375rem]"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Building2 className="size-5" style={{ color: "var(--color-ink-700)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="font-bold text-[1.0625rem] leading-tight"
              style={{ color: "var(--color-ink-950)" }}
            >
              {project.name}
            </h1>
            <p className="text-[0.6875rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {typeLabel} · {project.status}
            </p>
          </div>
        </div>

        {/* Address + dates */}
        <div className="mt-2.5 space-y-1">
          {project.address ? (
            <div className="flex items-center gap-1.5 text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{project.address}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {project.startDate ? (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {formatDate(project.startDate)}
              </span>
            ) : null}
            {project.endDate ? (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                → {formatDate(project.endDate)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Budget progress bar */}
        {totalBudget > 0 ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[0.5625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Budget used
              </span>
              <span
                className="text-[0.625rem] font-bold tabular-nums"
                style={{ color: isOverBudget ? "var(--color-stop)" : "var(--color-ink-950)" }}
              >
                {formatCurrency(totalProjectCost)} / {formatCurrency(totalBudget)}
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${budgetUsedPct}%`,
                  backgroundColor: isOverBudget ? "var(--color-stop)" : budgetUsedPct > 80 ? "var(--color-signal)" : "var(--color-go)",
                }}
              />
            </div>
            <p className="text-[0.5rem] mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {Math.round(budgetUsedPct)}%{isOverBudget ? ` · ${formatCurrency(totalProjectCost - totalBudget)} over` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Attention banner ── */}
      <AttentionBannerCarousel banners={attentionBanners} />

      {/* ── Overview + Details — 2-col grid (like inventory category cards) ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Overview card — KPIs */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <TrendingUp className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Overview
            </p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Units" value={formatNumber(units.length, 0)} sub={`${availableUnits.length} avail`} />
            <KpiRow label="Sold" value={formatNumber(soldUnits.length, 0)} tone="go" />
            <KpiRow label="Cost" value={totalProjectCost ? formatCurrency(totalProjectCost) : "—"} />
            <KpiRow label="₹/sqft" value={project.costPerSqft ? formatCurrency(toNum(project.costPerSqft)) : "—"} />
            <KpiRow label="Land" value={landParcels > 0 ? `${landParcels}` : "—"} sub={landParcels > 0 ? "parcels" : undefined} />
            <KpiRow label="Reqs" value={String(requisitions)} sub="pending" tone={requisitions > 0 ? "signal" : undefined} />
          </div>
        </div>

        {/* Details card — key attributes */}
        <div
          className="rounded-[0.625rem] border p-2.5"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <ClipboardList className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
            </span>
            <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Details
            </p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Budget" value={project.totalBudget ? formatCurrency(toNum(project.totalBudget)) : "—"} />
            <KpiRow label="Area" value={project.totalSellableArea ? `${formatNumber(toNum(project.totalSellableArea), 0)}` : "—"} sub="sqft" />
            <KpiRow label="Type" value={typeLabel} />
            {project.startDate ? <KpiRow label="Start" value={formatDate(project.startDate)} /> : null}
            {project.endDate ? <KpiRow label="End" value={formatDate(project.endDate)} /> : null}
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <SectionHead title="Quick actions" />
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <QuickActionTile href={`/m/site/dpr?project=${id}`} icon={FileText} label="New DPR" />
        <QuickActionTile href={`/m/requisitions?project=${id}`} icon={ClipboardList} label="Requisition" />
        <QuickActionTile href={`/m/site/issue?project=${id}`} icon={PackageCheck} label="Issue" />
      </div>

      {/* ── Units ── */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[0.9375rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          Units ({units.length})
        </h2>
        <Link
          href={`/m/units?project=${id}`}
          className="text-[0.6875rem] font-semibold"
          style={{ color: "var(--color-steel)" }}
        >
          View all →
        </Link>
      </div>
      {units.length === 0 ? (
        <MobileEmptyState
          icon={Home}
          title="No units yet"
          hint="Units show here once created"
        />
      ) : (
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {units.slice(0, 9).map((u) => (
            <UnitCard key={u.id} unit={u} />
          ))}
        </div>
      )}

      {/* ── Recent DPRs — top accent + progress bar ── */}
      {recentDprs.length > 0 ? (
        <>
          <MobileSectionTitle>Recent DPRs</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {recentDprs.map((dpr) => {
              const dprTone = dpr.approvalStatus === "APPROVED" ? "var(--color-go)" : dpr.approvalStatus === "REJECTED" ? "var(--color-stop)" : "var(--color-signal)";
              const pct = dpr.progressPct ? toNum(dpr.progressPct) : 0;
              return (
                <Link
                  key={dpr.id}
                  href={`/m/dprs/${dpr.id}`}
                  className="flex flex-col rounded-[0.5rem] border p-1.5 press overflow-hidden"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                  }}
                >
                  {/* Top accent strip */}
                  <div className="h-1 -mx-1.5 -mt-1.5 mb-1" style={{ backgroundColor: dprTone }} />
                  <p className="text-[0.5rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
                    {formatDate(dpr.date)}
                  </p>
                  <p className="text-[0.4375rem] mb-1 line-clamp-2 leading-tight flex-1" style={{ color: "var(--color-ink-500)" }}>
                    {dpr.workSummary?.slice(0, 50) ?? "No summary"}
                  </p>
                  {/* Progress bar at bottom */}
                  {pct > 0 ? (
                    <div className="mt-auto">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>progress</span>
                        <span className="text-[0.5rem] font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
                          {formatNumber(pct, 0)}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: dprTone }} />
                      </div>
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {/* ── Recent POs — left accent + status pill ── */}
      {recentPOs.length > 0 ? (
        <>
          <MobileSectionTitle>Recent POs</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {recentPOs.map((po) => {
              const poTone = po.status === "RECEIVED" ? "var(--color-go)" : po.status === "CANCELLED" ? "var(--color-stop)" : "var(--color-signal)";
              const poStatusShort = po.status === "RECEIVED" ? "Recv" : po.status === "APPROVED" ? "Appr" : po.status === "DRAFT" ? "Draft" : po.status === "CANCELLED" ? "Cxl" : po.status.slice(0, 4);
              return (
                <Link
                  key={po.id}
                  href={`/m/procurement/${po.id}`}
                  className="flex flex-col rounded-[0.5rem] border p-1.5 pl-2 press"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                    borderLeftColor: poTone,
                    borderLeftWidth: "3px",
                  }}
                >
                  <div className="flex items-center justify-between gap-0.5 mb-0.5">
                    <p className="text-[0.5rem] font-bold leading-tight truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
                      {po.poNumber}
                    </p>
                    <span
                      className="text-[0.375rem] font-bold uppercase px-1 py-px rounded shrink-0"
                      style={{ backgroundColor: poTone, color: "#fff" }}
                    >
                      {poStatusShort}
                    </span>
                  </div>
                  <p className="text-[0.4375rem] mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                    {po.supplier.name}
                  </p>
                  <p className="text-[0.4375rem] mt-auto" style={{ color: "var(--color-ink-500)" }}>
                    {formatDate(po.createdAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {/* ── Recent Issues — icon circle + monospace number ── */}
      {recentIssues.length > 0 ? (
        <>
          <MobileSectionTitle>Recent Issues</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {recentIssues.map((i) => (
              <Link
                key={i.id}
                href="/m/site/issue"
                className="flex flex-col rounded-[0.5rem] border p-1.5 press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper-2)",
                }}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span
                    className="grid place-items-center w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <PackageCheck className="size-2" style={{ color: "var(--color-ink-700)" }} />
                  </span>
                  <p className="text-[0.5rem] font-bold leading-tight truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
                    {i.issueNumber ?? "—"}
                  </p>
                </div>
                <p className="text-[0.4375rem] mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                  {i.fromLocation?.name ?? "—"}
                </p>
                <p className="text-[0.4375rem] mt-auto" style={{ color: "var(--color-ink-500)" }}>
                  {formatDate(i.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Recent Costs — dark tint + amount as hero ── */}
      {recentCosts.length > 0 ? (
        <>
          <MobileSectionTitle>Recent Costs</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {recentCosts.map((c) => (
              <Link
                key={c.id}
                href="/m/books/finance"
                className="flex flex-col rounded-[0.5rem] border p-1.5 press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-signal-wash)",
                }}
              >
                <p className="text-[0.5rem] font-bold tabular-nums leading-tight mb-0.5" style={{ color: "var(--color-signal-dark)" }}>
                  {formatCurrency(toNum(c.amount))}
                </p>
                <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-700)" }}>
                  {c.costType.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="text-[0.4375rem] mt-auto truncate" style={{ color: "var(--color-ink-500)" }}>
                  {c.vendor ?? "—"}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ─── Quick action tile ─── */
function QuickActionTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <Icon className="size-4" style={{ color: "var(--color-ink-700)" }} />
      <span className="text-[0.5625rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
        {label}
      </span>
    </a>
  );
}

/* ─── KPI row — compact label/value for the overview & details cards ─── */
function KpiRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "go" | "signal" | "stop";
}) {
  const color =
    tone === "go" ? "var(--color-go)" :
    tone === "signal" ? "var(--color-signal-dark)" :
    tone === "stop" ? "var(--color-stop)" :
    "var(--color-ink-950)";
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-[0.5rem] shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-[0.5625rem] font-bold text-right tabular-nums truncate" style={{ color }}>
        {value}
        {sub ? <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>{sub}</span> : null}
      </span>
    </div>
  );
}

/* ─── Unit card — compact 3-col grid card ─── */
function UnitCard({
  unit,
}: {
  unit: {
    id: string;
    unitNumber: string;
    unitType: string;
    status: string;
    area: unknown;
    areaUnit: string;
    floor: number | null;
    wing: string | null;
    askingPrice: unknown;
    productionCost: unknown;
    saleId: string | null;
  };
}) {
  const statusColors: Record<string, string> = {
    AVAILABLE: "var(--color-go)",
    UNDER_CONSTRUCTION: "var(--color-signal)",
    SOLD: "var(--color-steel)",
    PLANNED: "var(--color-ink-500)",
    BOOKED: "var(--color-signal-dark)",
  };
  const statusColor = statusColors[unit.status] ?? "var(--color-ink-500)";

  return (
    <Link
      href={`/m/units/${unit.id}`}
      className="flex flex-col rounded-[0.5rem] border p-1.5 press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        borderTopColor: statusColor,
        borderTopWidth: "2px",
      }}
    >
      {/* Unit number + status dot */}
      <div className="flex items-center justify-between gap-0.5 mb-0.5">
        <p className="text-[0.5625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {unit.unitNumber}
        </p>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Type */}
      <p className="text-[0.4375rem] mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
        {unit.unitType.replace(/_/g, " ").toLowerCase()}
      </p>

      {/* Area */}
      <p className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
        {formatNumber(toNum(unit.area), 0)} {unit.areaUnit}
      </p>

      {/* Price */}
      {unit.askingPrice ? (
        <p className="text-[0.5rem] font-bold tabular-nums truncate" style={{ color: "var(--color-steel)" }}>
          {formatCurrency(toNum(unit.askingPrice))}
        </p>
      ) : (
        <p className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
          no price
        </p>
      )}
    </Link>
  );
}
