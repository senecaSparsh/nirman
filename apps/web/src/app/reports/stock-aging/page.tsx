import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, scopeWhere, getUserPermissions, toNum } from "@/lib/server";
import { inventoryAgingReport } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { Page } from "@/components/page";
import { StockAgingReport, type AgingRow } from "@/components/reports/stock-aging-report";

/**
 * Stock Aging report — how long each material lot has been sitting since its
 * last inward movement. Dead stock (>90d) is working capital doing nothing —
 * and on a construction site it usually means over-buying against a project
 * that moved on.
 */
export default function StockAgingPage() {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading stock aging…" variant="cards" />}>
        <StockAgingContent />
      </Suspense>
    </Page>
  );
}

async function StockAgingContent() {
  await connection();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.INVENTORY_VIEW)) {
    return <NoAccess what="stock aging" permission={PERM.INVENTORY_VIEW} />;
  }
  const company = await getCompany();
  // Project-scoped users only see their allowed locations' stock — the scope
  // clause lands on projectId/departmentId, so resolve it to location ids
  // first (same pattern as the inventory-value report).
  const locScope = await scopeWhere("StockLocation", {});
  const allowedIds =
    Object.keys(locScope).length === 0
      ? null
      : new Set(
          (
            await prisma.stockLocation.findMany({
              where: { ...locScope, companyId: company.id, deletedAt: null },
              select: { id: true },
            })
          ).map((l) => l.id),
        );

  const rows = await inventoryAgingReport(company.id);
  const scoped = allowedIds ? rows.filter((r) => allowedIds.has(r.locationId)) : rows;

  const mapped: AgingRow[] = scoped.map((r) => ({
    materialCode: r.materialCode,
    materialName: r.materialName,
    unit: r.unit,
    locationName: r.locationName,
    qty: toNum(r.qty),
    value: toNum(r.value),
    lastInboundDate: r.lastInboundDate?.toISOString() ?? null,
    ageDays: r.ageDays,
    bucket: r.bucket,
    isSlowMoving: r.isSlowMoving,
  }));

  return (
    <>
      <PageHeader
        title="Stock Aging"
        description="Days since each material last moved in — dead stock (>90 days) is money parked in a godown."
        stats={[
          { label: "Stock rows", value: mapped.length, hint: "Material × location rows that have moved at least once." },
          { label: "Slow-moving >90d", value: mapped.filter((r) => r.isSlowMoving).length, hint: "Rows untouched for over a quarter — review for transfer or disposal." },
        ]}
      />
      <StockAgingReport rows={mapped} />
    </>
  );
}
