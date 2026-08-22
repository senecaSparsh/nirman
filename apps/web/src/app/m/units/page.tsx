import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Home } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileUnitsList } from "./MobileUnitsList";
import { MobileUnitsFab } from "./MobileUnitsFab";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/units — mobile built-unit inventory.
 *
 * Supports `?project=<id>` to filter to a single project (used when
 * navigated from a project detail page). Without the filter, shows
 * all units across the company.
 */
export default function MobileUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileUnitsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileUnitsContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);
  const { project: projectId } = await searchParams;

  const project = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, companyId: company.id, deletedAt: null },
        select: { id: true, name: true, type: true },
      })
    : null;

  const units = await prisma.builtUnit.findMany({
    where: {
      deletedAt: null,
      project: { companyId: company.id, deletedAt: null },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
    take: 200,
    include: { project: { select: { id: true, name: true } } },
  });

  const byStatus = (s: string) => units.filter((u) => u.status === s);
  const available = byStatus("AVAILABLE");
  const underConstruction = byStatus("UNDER_CONSTRUCTION");
  const planned = byStatus("PLANNED");
  const sold = byStatus("SOLD");
  const hold = byStatus("HOLD");
  const rented = byStatus("RENTED");
  const reserved = byStatus("RESERVED");

  const sellable = [...available, ...underConstruction, ...planned];
  const otherCount = hold.length + rented.length + reserved.length;

  // Financial metrics — NOT counts (those are in the hero breakdown bar)
  const inventoryValue = sellable.reduce(
    (s, u) => s + toNum(u.askingPrice ?? u.currentValuation),
    0,
  );
  const pricedSellable = sellable.filter((u) => u.askingPrice);
  const avgPricePerSqft =
    pricedSellable.length > 0
      ? pricedSellable.reduce((s, u) => s + toNum(u.askingPrice) / toNum(u.area), 0) / pricedSellable.length
      : 0;
  const unpricedCount = sellable.filter((u) => !u.askingPrice).length;

  // Serialize for the client component
  const serialized = units.map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    status: u.status,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    projectId: u.project.id,
    projectName: u.project.name,
  }));

  // Fetch active projects for the create-unit dialog dropdown
  const projects = canManage
    ? await prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const csvColumns: MobileColumnSpec[] = [
    { key: "unitNumber", label: "Unit #" },
    { key: "projectName", label: "Project" },
    { key: "unitType", label: "Type" },
    { key: "status", label: "Status" },
    { key: "area", label: "Area" },
    { key: "askingPrice", label: "Sale Price", format: "currency" },
  ];

  return (
    <div>
      {/* ── Compact summary card — name, breakdown bar, key financials in one ── */}
      {units.length > 0 ? (
        <div
          className="rounded-[0.625rem] border p-2.5 mb-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {/* Row 1: name + count */}
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <h1 className="font-bold text-[0.875rem] leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
              {project ? project.name : "All Units"}
            </h1>
            <span className="text-[0.5625rem] tabular-nums shrink-0" style={{ color: "var(--color-ink-500)" }}>
              {units.length} unit{units.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Row 2: breakdown bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mb-1.5" style={{ backgroundColor: "var(--color-concrete)" }}>
            {available.length > 0 ? (
              <div style={{ width: `${(available.length / units.length) * 100}%`, backgroundColor: "var(--color-go)" }} />
            ) : null}
            {underConstruction.length > 0 ? (
              <div style={{ width: `${(underConstruction.length / units.length) * 100}%`, backgroundColor: "var(--color-signal)" }} />
            ) : null}
            {planned.length > 0 ? (
              <div style={{ width: `${(planned.length / units.length) * 100}%`, backgroundColor: "var(--color-signal-dark)" }} />
            ) : null}
            {sold.length > 0 ? (
              <div style={{ width: `${(sold.length / units.length) * 100}%`, backgroundColor: "var(--color-steel)" }} />
            ) : null}
            {otherCount > 0 ? (
              <div style={{ width: `${(otherCount / units.length) * 100}%`, backgroundColor: "var(--color-ink-500)" }} />
            ) : null}
          </div>

          {/* Row 3: inline financial stats — 3 key numbers only */}
          <div className="flex items-center justify-between gap-2">
            <Stat label="Stock" value={formatCurrency(inventoryValue)} />
            <Divider />
            <Stat label="₹/sqft" value={avgPricePerSqft > 0 ? formatNumber(avgPricePerSqft, 0) : "—"} />
            <Divider />
            <Stat
              label="Unpriced"
              value={String(unpricedCount)}
              tone={unpricedCount > 0 ? "signal" : "go"}
            />
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        <MobileExportShareBar
          title="Built Units"
          rows={serialized as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`${units.length} units · Stock value: ${formatCurrency(inventoryValue)}`}
        />
      </div>

      {/* ── Searchable/filterable list ── */}
      <MobileUnitsList items={serialized} projectFiltered={!!project} />

      {/* ── FAB: New Unit ── */}
      {canManage && projects.length > 0 && (
        <MobileUnitsFab projects={projects} defaultProjectId={projectId} />
      )}

      {/* ── Empty state ── */}
      {units.length === 0 ? (
        <MobileEmptyState
          icon={Home}
          title="No units yet"
          hint={canManage && projects.length > 0 ? "Tap + to create your first built unit." : "Units show here once a project creates them."}
          action={
            !canManage || projects.length === 0 ? (
              <MobileCta href="/m/projects" icon={Home} variant="primary">
                View Projects
              </MobileCta>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

/* ─── Inline stat ─── */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "go" | "signal";
}) {
  const color =
    tone === "go" ? "var(--color-go)" :
    tone === "signal" ? "var(--color-signal-dark)" :
    "var(--color-ink-950)";
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="text-[0.4375rem] uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-[0.625rem] font-bold tabular-nums truncate" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-6 shrink-0" style={{ backgroundColor: "var(--color-line)" }} />;
}
