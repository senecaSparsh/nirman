import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, AlertTriangle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileCta,
} from "@/components/mobile/mobile-primitives";
import { MobileMaterialsList } from "./MobileMaterialsList";

/**
 * /m/materials — mobile material catalogue with live stock + low-stock flags.
 * Replaces every desktop `/materials` link from the mobile surface.
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
      stockItems: { where: { location: { companyId: company.id } }, select: { qty: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const rows = materials
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = m.minStock ? toNum(m.minStock) : null;
      const isLow = minStock != null && totalQty < minStock;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        categoryName: m.category.name,
        totalQty,
        minStock,
        reorderPoint: m.reorderPoint ? toNum(m.reorderPoint) : null,
        isLow,
      };
    })
    .sort((a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name));

  const lowStock = rows.filter((r) => r.isLow);

  return (
    <div>
      <MobilePageHeader
        title="Materials"
        subtitle={`${rows.length} items · ${lowStock.length} low`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Total Items" value={formatNumber(rows.length, 0)} icon={Package} />
        <MobileStatCard
          label="Low Stock"
          value={formatNumber(lowStock.length, 0)}
          icon={AlertTriangle}
          tone={lowStock.length > 0 ? "danger" : "default"}
        />
      </div>

      <MobileMaterialsList items={rows} />

      {rows.length === 0 && (
        <>
          <MobileSectionTitle>All Materials</MobileSectionTitle>
          <MobileEmptyState
            icon={Package}
            title="No materials"
            hint="Add materials from the desktop Setup page to start tracking stock."
            action={<MobileCta href="/materials" icon={Package}>Go to Materials Setup</MobileCta>}
          />
        </>
      )}
    </div>
  );
}
