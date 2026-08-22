import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileMaterialsList } from "./MobileMaterialsList";

/**
 * /m/materials — mobile material catalogue.
 *
 * Visual architecture matches nirman-os catalog page:
 *   - KPI strip at top
 *   - Sticky search header with category chips
 *   - 2-column card grid (MaterialCard)
 */
export default function MobileMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileMaterialsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileMaterialsContent({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);
  const { category } = await searchParams;

  const materials = await prisma.material.findMany({
    where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      standardCost: true,
      currentCost: true,
      minStock: true,
      reorderPoint: true,
      category: { select: { name: true } },
      stockItems: { where: { location: { companyId: company.id } }, select: { qty: true, movingAvgCost: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const rows = materials
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const stockValue = m.stockItems.reduce(
        (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
        0,
      );
      const unitCost = toNum(m.currentCost ?? m.standardCost);
      const minStock = m.minStock ? toNum(m.minStock) : null;
      const reorderPoint = m.reorderPoint ? toNum(m.reorderPoint) : null;
      const isLow = reorderPoint != null && totalQty <= reorderPoint;
      const isOut = totalQty <= 0;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        categoryName: m.category.name,
        totalQty,
        stockValue,
        unitCost,
        minStock,
        reorderPoint,
        isLow,
        isOut,
      };
    })
    .sort((a, b) => Number(b.isLow || b.isOut) - Number(a.isLow || a.isOut) || a.name.localeCompare(b.name));

  return (
    <div>
      <MobileExportShareBar
        title="Materials"
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "categoryName", label: "Category" },
          { key: "unit", label: "Unit" },
          { key: "reorderPoint", label: "Reorder Point" },
          { key: "totalQty", label: "Stock Qty" },
          { key: "stockValue", label: "Stock Value", format: "currency" },
        ] as MobileColumnSpec[]}
        summary={`${rows.length} materials`}
      />
      <MobileMaterialsList
        key={category ?? "all"}
        items={rows}
        initialCategory={category}
      />

      {rows.length === 0 && (
        <>
          <MobileEmptyState
            icon={Package}
            title="No materials"
            hint="Materials will appear here once they're added to the system and stock is received."
            action={canManage ? (
              <MobileCta href="/m/materials/new" icon={Plus}>Add Material</MobileCta>
            ) : (
              <MobileCta href="/m/stock" icon={Package}>View Stock Ledger</MobileCta>
            )}
          />
        </>
      )}

      {/* Floating add button */}
      {canManage && rows.length > 0 && (
        <Link
          href="/m/materials/new"
          className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
          style={{
            bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
            backgroundColor: "var(--color-ink-950)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          aria-label="Add new material"
        >
          <Plus className="size-5" />
        </Link>
      )}
    </div>
  );
}
