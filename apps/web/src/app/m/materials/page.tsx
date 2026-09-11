import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Package } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileMaterialsList } from "./MobileMaterialsList";
import { MobileMaterialsFab } from "./MobileMaterialsFab";

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
    <MobileListPage managePerm={PERM.INVENTORY_MANAGE} skeletonRows={8}>
      {async ({ company, canManage }) => {
        const { category } = await searchParams;
        // Scope-aware action permissions (for FAB gating)
        const actions = await getActionPermissions();

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

        const categories = actions.canCreateMaterial
          ? (await prisma.materialCategory.findMany({
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true, unit: true, hsnCode: true, gstRate: true },
            })).map((c) => ({ ...c, gstRate: c.gstRate ? c.gstRate.toNumber() : null }))
          : [];

        // Fetch stock locations for the opening-stock section in the FAB dialog
        const locations = actions.canCreateMaterial
          ? await prisma.stockLocation.findMany({
              where: { companyId: company.id, deletedAt: null },
              orderBy: [{ type: "asc" }, { name: "asc" }],
              select: {
                id: true,
                name: true,
                project: { select: { name: true } },
              },
            }).then((locs) => locs.map((l) => ({ id: l.id, name: l.name, projectName: l.project?.name ?? null })))
          : [];

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

        const exportColumns: MobileColumnSpec[] = [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "categoryName", label: "Category" },
          { key: "unit", label: "Unit" },
          { key: "reorderPoint", label: "Reorder Point" },
          { key: "totalQty", label: "Stock Qty" },
          { key: "stockValue", label: "Stock Value", format: "currency" },
        ];

        return (
          <div>
            <MobileMaterialsList
              key={category ?? "all"}
              items={rows}
              initialCategory={category}
              exportTitle="Materials"
              exportRows={rows as unknown as Record<string, unknown>[]}
              exportColumns={exportColumns}
              exportSummary={`${rows.length} materials`}
            />

            {rows.length === 0 && (
              <>
                <MobileEmptyState
                  icon={Package}
                  title="No materials"
                  description={
                    canManage
                      ? "Tap the + button below to add your first material."
                      : "Materials will appear here once they're added and stock is received."
                  }
                  secondaryAction={!canManage ? (
                    <MobileCta href="/m/stock" icon={Package}>View Stock Ledger</MobileCta>
                  ) : undefined}
                />
              </>
            )}

            {/* Floating add button — springs into a modal with the new-material form */}
            {actions.canCreateMaterial && (
              <MobileMaterialsFab categories={categories} locations={locations} />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
