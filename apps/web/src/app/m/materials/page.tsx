import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import {
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileMaterialsList } from "./MobileMaterialsList";

/**
 * /m/materials — mobile material catalogue.
 *
 * Visual architecture matches nirman-os catalog page:
 *   - KPI strip at top
 *   - Sticky search header with category chips
 *   - 2-column card grid (MaterialCard)
 */
export default function MobileMaterialsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileMaterialsContent />
    </Suspense>
  );
}

async function MobileMaterialsContent() {
  await connection();
  const company = await getCompany();

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
      <MobileMaterialsList items={rows} />

      {rows.length === 0 && (
        <>
          <MobileEmptyState
            icon={Package}
            title="No materials"
            hint="Materials will appear here once they're added to the system and stock is received."
            action={<MobileCta href="/m/stock" icon={Package}>View Stock Ledger</MobileCta>}
          />
        </>
      )}
    </div>
  );
}
