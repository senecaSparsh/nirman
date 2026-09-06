import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import {
  Building2, Home, ClipboardList,
  MapPin, Calendar, TrendingUp, PackageCheck,
  FileText, CalendarCheck, ShieldCheck,
  Truck, Wallet, Wrench,
} from "lucide-react";
import { MobileProjectPossession } from "./MobileProjectPossession";
import { MobileProjectTabs } from "./MobileProjectTabs";
import { MobileCheckMilestonesButton } from "./MobileCheckMilestonesButton";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatNumber, formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
  mobileStatusColor,
  MobilePipelineStepper,
} from "@/components/mobile/v2/primitives";

import { MobileEditProjectButton } from "./MobileEditProjectButton";
import { MobileDeleteProjectButton } from "./MobileDeleteProjectButton";
import { MobileLegalDocsSection } from "@/components/legal/mobile-legal-docs-section";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";

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
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
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
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.PROJECTS_MANAGE);
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });

  if (!project) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <MobileEmptyState icon={Building2} title="Project not found" />
      </div>
    );
  }

  const [units, recentPOs, recentIssues, recentCosts, recentDprs, requisitions, landParcels, recentAttendance, legalDocs] =
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
      prisma.workerAttendance.findMany({
        where: { projectId: id },
        orderBy: { date: "desc" },
        take: 5,
        include: { employee: { select: { name: true } } },
      }),
      // Legal documents for this project
      prisma.legalDocument.findMany({
        where: { projectId: id, companyId: company.id, deletedAt: null },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      }),
    ]);

  const availableUnits = units.filter((u) => u.status === "AVAILABLE" || u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION");
  const soldUnits = units.filter((u) => u.saleId != null);
  const totalProjectCost = project.totalProjectCost ? toNum(project.totalProjectCost) : 0;
  const totalBudget = project.totalBudget ? toNum(project.totalBudget) : 0;
  const budgetUsedPct = totalBudget > 0 ? Math.min(100, (totalProjectCost / totalBudget) * 100) : 0;
  const isOverBudget = totalBudget > 0 && totalProjectCost > totalBudget;

  // ── Tab badge counts (things that need attention, not just counts) ──
  const pendingDprs = recentDprs.filter((d) => d.approvalStatus === "SUBMITTED" || d.approvalStatus === "SUB_ADMIN_APPROVED");
  const activityBadge = pendingDprs.length + requisitions;
  const unitsBadge = units.filter((u) => !u.askingPrice && (u.status === "AVAILABLE" || u.status === "UNDER_CONSTRUCTION")).length;
  const legalBadge = legalDocs.filter((d) => !d.obtained).length;

  const typeLabel = project.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      <RecordRecentItem type="project" id={project.id} label={project.name} href={`/m/projects/${project.id}`} />

      {/* ── Lifecycle pipeline ── */}
      <div className="rounded-[0.5rem] border px-3 py-2 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <MobilePipelineStepper steps={[
          { label: "Planned", state: project.status === "PLANNED" ? "current" : "done" },
          { label: "Active", state: project.status === "ACTIVE" ? "current" : project.status === "COMPLETED" ? "done" : project.status === "ON_HOLD" ? "done" : "pending" },
          { label: "On Hold", state: project.status === "ON_HOLD" ? "current" : "pending" },
          { label: "Completed", state: project.status === "COMPLETED" ? "current" : "pending" },
        ]} />
      </div>

      {/* ── Hero card ── */}
      <div
        className="rounded-[0.875rem] border p-3.5 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="grid place-items-center w-9 h-9 rounded-[0.5rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Building2 className="size-4" style={{ color: "var(--color-ink-700)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1
                className="font-bold text-m-section leading-tight truncate"
                style={{ color: "var(--color-ink-950)" }}
              >
                {project.name}
              </h1>
              <MobileStatusBadge status={project.status} />
            </div>
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              {typeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MobileCheckMilestonesButton projectId={project.id} />
            {canManage && (
              <>
                <MobileEditProjectButton
                  project={{
                    id: project.id,
                    name: project.name,
                    type: project.type as "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER",
                    status: project.status as "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD",
                    address: project.address,
                    startDate: project.startDate?.toISOString() ?? null,
                    endDate: project.endDate?.toISOString() ?? null,
                    totalBudget: project.totalBudget ? toNum(project.totalBudget) : null,
                    totalSellableArea: project.totalSellableArea ? toNum(project.totalSellableArea) : null,
                    description: project.description,
                    reraNumber: project.reraNumber,
                    reraRegistrationDate: project.reraRegistrationDate?.toISOString() ?? null,
                    reraValidityDate: project.reraValidityDate?.toISOString() ?? null,
                    reraWebsiteUrl: project.reraWebsiteUrl,
                    lciThreshold: project.lciThreshold ? toNum(project.lciThreshold) : null,
                  }}
                />
                <MobileDeleteProjectButton projectId={project.id} name={project.name} />
              </>
            )}
          </div>
        </div>

        {project.reraNumber && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-m-caption font-bold"
            style={{
              color: "var(--color-go)",
              backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)",
            }}>
            <ShieldCheck className="size-2.5" />
            RERA: {project.reraNumber}
          </div>
        )}

        {/* Address + dates */}
        <div className="mt-2.5 space-y-1">
          {project.address ? (
            <div className="flex items-center gap-1.5 text-m-label" style={{ color: "var(--color-ink-500)" }}>
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{project.address}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-m-label" style={{ color: "var(--color-ink-500)" }}>
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
              <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Budget used
              </span>
              <span
                className="text-m-label font-bold tabular-nums"
                style={{ color: isOverBudget ? "var(--color-stop)" : "var(--color-ink-950)" }}
              >
                {formatCurrencyCompact(totalProjectCost)} / {formatCurrencyCompact(totalBudget)}
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
            <p className="text-m-caption mt-0.5 text-right tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {Math.round(budgetUsedPct)}%{isOverBudget ? ` · ${formatCurrencyCompact(totalProjectCost - totalBudget)} over` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Section toggle tabs with badge counts ── */}
      <MobileProjectTabs
        tabs={{ units: unitsBadge, activity: activityBadge, legal: legalBadge }}
      >
        {{
          overview: (
            <>
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
            <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
              Overview
            </p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Units" value={formatNumber(units.length, 0)} sub={`${availableUnits.length} avail`} />
            <KpiRow label="Sold" value={formatNumber(soldUnits.length, 0)} tone="go" />
            <KpiRow label="Cost" value={totalProjectCost ? formatCurrencyCompact(totalProjectCost) : "—"} />
            <KpiRow label="₹/sqft" value={project.costPerSqft ? formatCurrencyCompact(toNum(project.costPerSqft)) : "—"} />
            <KpiRow label="Land" value={landParcels > 0 ? `${landParcels}` : "—"} sub={landParcels > 0 ? "parcels" : undefined} />
            <KpiRow label="Indents" value={String(requisitions)} sub="pending" tone={requisitions > 0 ? "signal" : undefined} />
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
            <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
              Details
            </p>
          </div>
          <div className="space-y-1.5">
            <KpiRow label="Budget" value={project.totalBudget ? formatCurrencyCompact(toNum(project.totalBudget)) : "—"} />
            <KpiRow label="Area" value={project.totalSellableArea ? `${formatNumber(toNum(project.totalSellableArea), 0)}` : "—"} sub="sqft" />
            <KpiRow label="Type" value={typeLabel} />
            {project.startDate ? <KpiRow label="Start" value={formatDate(project.startDate)} /> : null}
            {project.endDate ? <KpiRow label="End" value={formatDate(project.endDate)} /> : null}
          </div>
        </div>
      </div>

      {/* ── Possession tracking ── */}
      <MobileProjectPossession
        projectId={project.id}
        isPossessed={project.isPossessed}
        possessionDate={project.possessionDate?.toISOString() ?? null}
        possessionNotes={project.possessionNotes}
        canManage={canManage}
      />

      {/* ── Quick actions ── */}
      <SectionHead title="Quick actions" />
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <QuickActionTile href={`/m/site/dpr?project=${id}`} icon={FileText} label="New Daily Progress Report" />
        <QuickActionTile href={`/m/requisitions?project=${id}`} icon={ClipboardList} label="Indent" />
        <QuickActionTile href={`/m/stock-out?mode=issue&project=${id}`} icon={PackageCheck} label="Issue" />
        <QuickActionTile href={`/m/procurement/new?project=${id}`} icon={Truck} label="New Purchase Order" />
        <QuickActionTile href={`/m/units?project=${id}`} icon={Home} label="Add Built Units" />
        <QuickActionTile href={`/m/sales/new?project=${id}`} icon={TrendingUp} label="Record a Sale" />
        <QuickActionTile href={`/m/books/finance?project=${id}`} icon={Wallet} label="Add Project Cost" />
        <QuickActionTile href="/m/equipment" icon={Wrench} label="Assign Equipment" />
      </div>
            </>
          ),
          units: (
            <>
      {/* ── Units ── */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Units ({units.length})
        </h2>
        <Link
          href={`/m/units?project=${id}`}
          className="text-m-body font-semibold"
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
            </>
          ),
          activity: (
            <>
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
                  className="flex flex-col rounded-[0.5rem] border p-1.5 text-m-body press overflow-hidden"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                  }}
                >
                  {/* Top accent strip */}
                  <div className="h-1 -mx-1.5 -mt-1.5 mb-1" style={{ backgroundColor: dprTone }} />
                  <p className="text-m-caption font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
                    {formatDate(dpr.date)}
                  </p>
                  <p className="text-m-caption mb-1 line-clamp-2 leading-tight flex-1" style={{ color: "var(--color-ink-500)" }}>
                    {dpr.workSummary?.slice(0, 50) ?? "No summary"}
                  </p>
                  {/* Progress bar at bottom */}
                  {pct > 0 ? (
                    <div className="mt-auto">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>progress</span>
                        <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-steel)" }}>
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
                  className="flex flex-col rounded-[0.5rem] border p-1.5 pl-2 text-m-body press"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                    borderLeftColor: poTone,
                    borderLeftWidth: "3px",
                  }}
                >
                  <div className="flex items-center justify-between gap-0.5 mb-0.5">
                    <p className="text-m-caption font-bold leading-tight truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
                      {po.poNumber}
                    </p>
                    <span
                      className="text-m-caption font-bold uppercase px-1 py-px rounded shrink-0"
                      style={{ backgroundColor: poTone, color: "var(--color-paper)" }}
                    >
                      {poStatusShort}
                    </span>
                  </div>
                  <p className="text-m-caption mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                    {po.supplier.name}
                  </p>
                  <p className="text-m-caption mt-auto" style={{ color: "var(--color-ink-500)" }}>
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
                href="/m/stock-out?mode=issue"
                className="flex flex-col rounded-[0.5rem] border p-1.5 text-m-body press"
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
                  <p className="text-m-caption font-bold leading-tight truncate font-mono" style={{ color: "var(--color-ink-950)" }}>
                    {i.issueNumber ?? "—"}
                  </p>
                </div>
                <p className="text-m-caption mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                  {i.fromLocation?.name ?? "—"}
                </p>
                <p className="text-m-caption mt-auto" style={{ color: "var(--color-ink-500)" }}>
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
                className="flex flex-col rounded-[0.5rem] border p-1.5 text-m-body press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-signal-wash)",
                }}
              >
                <p className="text-m-caption font-bold tabular-nums leading-tight mb-0.5" style={{ color: "var(--color-signal-dark)" }}>
                  {formatCurrencyCompact(toNum(c.amount))}
                </p>
                <p className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>
                  {c.costType.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="text-m-caption mt-auto truncate" style={{ color: "var(--color-ink-500)" }}>
                  {c.vendor ?? "—"}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Recent Attendance ── */}
      {recentAttendance.length > 0 ? (
        <>
          <MobileSectionTitle>Recent Attendance</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {recentAttendance.map((a) => (
              <Link
                key={a.id}
                href={`/m/attendance?project=${id}`}
                className="flex flex-col gap-1 rounded-[0.625rem] border p-2 text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="grid place-items-center size-6 rounded-full shrink-0"
                    style={{ backgroundColor: "var(--color-paper-2)" }}
                  >
                    <CalendarCheck className="size-3" style={{ color: "var(--color-ink-700)" }} />
                  </div>
                  <span className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {a.employee?.name ?? "Worker"}
                  </span>
                </div>
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {formatDate(a.date)}
                </span>
                <span
                  className="text-m-caption font-bold uppercase"
                  style={{
                    color: a.status === "PRESENT" ? "var(--color-go)" : a.status === "ABSENT" ? "var(--color-stop)" : "var(--color-signal-dark)",
                  }}
                >
                  {a.status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
            </>
          ),
          legal: (
            <>
      {/* ── Legal documents (permissions, licenses, NOCs, certificates, ATS) ── */}
      <MobileLegalDocsSection
        docs={legalDocs.map((d) => ({
          id: d.id,
          landPurchaseId: d.landPurchaseId,
          projectId: d.projectId,
          type: d.type,
          title: d.title,
          authority: d.authority,
          status: d.status,
          appliesTo: d.appliesTo,
          docNumber: d.docNumber,
          sortOrder: d.sortOrder,
          prerequisiteType: d.prerequisiteType,
          obtained: d.obtained,
          applicationDate: d.applicationDate?.toISOString() ?? null,
          issueDate: d.issueDate?.toISOString() ?? null,
          validFrom: d.validFrom?.toISOString() ?? null,
          validTill: d.validTill?.toISOString() ?? null,
          amount: d.amount ? toNum(d.amount) : null,
          expectedRegistryDate: d.expectedRegistryDate?.toISOString() ?? null,
          documentUrl: d.documentUrl,
          documentName: d.documentName,
          notes: d.notes,
          createdAt: d.createdAt.toISOString(),
        }))}
        projectId={id}
        canManage={hasPermission(role, PERM.LEGAL_MANAGE)}
        context="PROJECT"
      />
            </>
          ),
        }}
      </MobileProjectTabs>
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
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 text-m-body text-m-body press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <Icon className="size-4" style={{ color: "var(--color-ink-700)" }} />
      <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-950)" }}>
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
      <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-m-caption font-bold text-right tabular-nums truncate" style={{ color }}>
        {value}
        {sub ? <span className="font-normal ml-1" style={{ color: "var(--color-ink-500)" }}>{" "}{sub}</span> : null}
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
  const statusColor = mobileStatusColor(unit.status);
  const needsAttention = !unit.askingPrice && (unit.status === "AVAILABLE" || unit.status === "UNDER_CONSTRUCTION");
  const statusShort: Record<string, string> = {
    PLANNED: "Plan",
    UNDER_CONSTRUCTION: "U/C",
    AVAILABLE: "Avail",
    RESERVED: "Rsvd",
    HOLD: "Hold",
    SOLD: "Sold",
    RENTED: "Rent",
  };
  const short = statusShort[unit.status] ?? unit.status.slice(0, 4);

  return (
    <Link
      href={`/m/units/${unit.id}`}
      className={`flex flex-col rounded-[0.5rem] border p-1.5 text-m-body press ${needsAttention ? "card-pulse" : ""}`}
      style={{
        borderColor: needsAttention ? "var(--color-stop)" : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        borderTopColor: statusColor,
        borderTopWidth: "2px",
      }}
    >
      {/* Unit number + status pill */}
      <div className="flex items-center justify-between gap-0.5 mb-0.5">
        <p className="text-m-caption font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {unit.unitNumber}
        </p>
        <span
          className="shrink-0 text-[0.5rem] font-bold uppercase leading-none px-1 py-0.5 rounded"
          style={{
            backgroundColor: mobileStatusColor(unit.status, "wash"),
            color: mobileStatusColor(unit.status, "dark"),
          }}
        >
          {short}
        </span>
      </div>

      {/* Type */}
      <p className="text-m-caption mb-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
        {unit.unitType.startsWith("BHK_")
          ? `${unit.unitType.slice(4)} BHK`
          : unit.unitType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
      </p>

      {/* Area */}
      <p className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
        {formatNumber(toNum(unit.area), 0)} {unit.areaUnit.toLowerCase()}
      </p>

      {/* Price */}
      {unit.askingPrice ? (
        <p className="text-m-caption font-bold tabular-nums truncate" style={{ color: "var(--color-steel)" }}>
          {formatCurrencyCompact(toNum(unit.askingPrice))}
        </p>
      ) : (
        <p className="text-m-caption font-bold" style={{ color: "var(--color-stop)" }}>
          no price
        </p>
      )}
    </Link>
  );
}
