import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getProjectMaterialReconciliation } from "@nirman/services";
import { Package, AlertTriangle, TrendingDown, Plus } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileSectionTitle,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileMaterialReconProjectSelector } from "./MobileMaterialReconProjectSelector";

/**
 * /m/material-reconciliation — mobile material reconciliation page.
 *
 * For a selected project, shows required (BOQ) vs issued vs consumed vs stock,
 * with variance and wastage flags. Tolerance-based colour coding:
 * green = within tolerance, red = over tolerance.
 */
export default function MobileMaterialReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileMaterialReconContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileMaterialReconContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.ASSETS_VIEW);
  const { project: projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!projectId) {
    return (
      <div>
        <MobileMaterialReconProjectSelector projects={projects} selectedId={null} />
        <MobileEmptyState
          icon={Package}
          title="Select a project"
          hint="Choose a project to view material reconciliation — required vs issued vs consumed vs stock"
        />
      </div>
    );
  }

  // Default tolerance = 5%
  const reconciliation = await getProjectMaterialReconciliation(projectId, 5);

  const totalRequired = reconciliation.totalRequired.toNumber();
  const totalIssued = reconciliation.totalIssued.toNumber();
  const totalConsumed = reconciliation.totalConsumed.toNumber();
  const overToleranceCount = reconciliation.overToleranceCount;

  // Serialize Decimal fields for rendering
  const items = reconciliation.items.map((i) => ({
    materialId: i.materialId,
    materialName: i.materialName,
    unit: i.unit,
    requiredQty: i.requiredQty.toNumber(),
    issuedQty: i.issuedQty.toNumber(),
    consumedQty: i.consumedQty.toNumber(),
    currentStock: i.currentStock.toNumber(),
    issueVariance: i.issueVariance.toNumber(),
    consumptionVariance: i.consumptionVariance.toNumber(),
    stockVariance: i.stockVariance.toNumber(),
    wastagePct: i.wastagePct.toNumber(),
    tolerancePct: i.tolerancePct.toNumber(),
    isOverTolerance: i.isOverTolerance,
    alertLevel: i.alertLevel,
  }));

  return (
    <div>
      <MobileMaterialReconProjectSelector projects={projects} selectedId={projectId} />

      {/* ── Summary stats ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard
          label="Required"
          value={formatNumber(totalRequired, 2)}
          icon={Package}
          tone="neutral"
        />
        <MobileStatCard
          label="Issued"
          value={formatNumber(totalIssued, 2)}
          icon={Package}
          tone="signal"
        />
        <MobileStatCard
          label="Consumed"
          value={formatNumber(totalConsumed, 2)}
          icon={Package}
          tone="go"
        />
      </div>

      {overToleranceCount > 0 && (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border p-2.5 mb-4"
          style={{
            borderColor: "var(--color-stop)",
            backgroundColor: "var(--color-stop-wash)",
          }}
        >
          <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
          <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-stop)" }}>
            {overToleranceCount} material{overToleranceCount !== 1 ? "s" : ""} over tolerance
          </p>
        </div>
      )}

      {/* ── Material reconciliation list ────────────────────────── */}
      <MobileSectionTitle>
        Materials
        <span
          className="text-[0.5625rem] font-semibold"
          style={{ color: "var(--color-ink-500)" }}
        >
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </MobileSectionTitle>

      {items.length === 0 ? (
        <MobileEmptyState
          icon={Package}
          title="No reconciliation data"
          hint="This project has no BOQ line items to reconcile yet."
          action={
            <MobileCta href={`/m/boq${projectId ? `?project=${projectId}` : ""}`} icon={Plus} variant="primary">
              Go to BOQ
            </MobileCta>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <ReconCard key={item.materialId ?? item.materialName} item={item} />
          ))}
        </div>
      )}

      {!canView && (
        <p
          className="text-[0.5625rem] text-center mt-4"
          style={{ color: "var(--color-ink-500)" }}
        >
          View-only access — contact an admin for manage permissions.
        </p>
      )}
    </div>
  );
}

function ReconCard({
  item,
}: {
  item: {
    materialName: string;
    unit: string;
    requiredQty: number;
    issuedQty: number;
    consumedQty: number;
    consumptionVariance: number;
    wastagePct: number;
    tolerancePct: number;
    isOverTolerance: boolean;
    alertLevel: "OK" | "WARNING" | "CRITICAL";
  };
}) {
  // Variance colour: green if within tolerance, red if over
  const varianceColor = item.isOverTolerance
    ? "var(--color-stop)"
    : "var(--color-go)";

  const wastageColor = item.isOverTolerance
    ? "var(--color-stop)"
    : Math.abs(item.wastagePct) > 0
      ? "var(--color-signal-dark)"
      : "var(--color-ink-500)";

  return (
    <div
      className="rounded-[0.625rem] border p-2.5"
      style={{
        borderColor: item.isOverTolerance
          ? "var(--color-stop)"
          : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* ── Header: name + wastage badge ── */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.75rem] font-bold leading-tight truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {item.materialName}
          </p>
          <p
            className="text-[0.5625rem] mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            {item.unit}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 justify-end">
            {item.isOverTolerance && (
              <TrendingDown
                className="size-3"
                style={{ color: "var(--color-stop)" }}
              />
            )}
            <p
              className="text-[0.6875rem] font-bold tabular-nums"
              style={{ color: wastageColor }}
            >
              {item.wastagePct > 0 ? "+" : ""}
              {formatNumber(item.wastagePct, 1)}%
            </p>
          </div>
          <p
            className="text-[0.4375rem] mt-0.5"
            style={{ color: "var(--color-ink-500)" }}
          >
            wastage
          </p>
        </div>
      </div>

      {/* ── Qty grid: required / issued / consumed ── */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <QtyCell label="Required" value={formatNumber(item.requiredQty, 2)} />
        <QtyCell label="Issued" value={formatNumber(item.issuedQty, 2)} />
        <QtyCell label="Consumed" value={formatNumber(item.consumedQty, 2)} />
      </div>

      {/* ── Variance footer ── */}
      <div
        className="flex items-center justify-between pt-2 border-t"
        style={{ borderColor: "var(--color-line)" }}
      >
        <p
          className="text-[0.5rem] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-ink-500)" }}
        >
          Consumption variance
        </p>
        <p
          className="text-[0.6875rem] font-bold tabular-nums"
          style={{ color: varianceColor }}
        >
          {item.consumptionVariance > 0 ? "+" : ""}
          {formatNumber(item.consumptionVariance, 2)} {item.unit}
        </p>
      </div>

      {/* ── Tolerance hint ── */}
      <p
        className="text-[0.4375rem] mt-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        Tolerance: ±{formatNumber(item.tolerancePct, 0)}% ·{" "}
        {item.isOverTolerance ? "Over tolerance" : "Within tolerance"}
      </p>
    </div>
  );
}

function QtyCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[0.375rem] px-1.5 py-1"
      style={{ backgroundColor: "var(--color-concrete)" }}
    >
      <p
        className="text-[0.4375rem] font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
      </p>
      <p
        className="text-[0.6875rem] font-bold tabular-nums leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {value}
      </p>
    </div>
  );
}
