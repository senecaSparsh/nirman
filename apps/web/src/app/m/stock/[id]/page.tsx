import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, MapPin, IndianRupee, AlertTriangle, Layers, TrendingDown } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileStockDetailContent params={params} />
    </Suspense>
  );
}

async function MobileStockDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const material = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      stockItems: {
        where: { location: { companyId: company.id, deletedAt: null } },
        include: { location: { select: { id: true, name: true, type: true } } },
      },
    },
  });

  if (!material) {
    return (
      <div>
        <MobileDetailHeader title="Material" backHref="/m/stock" />
        <MobileEmptyState icon={Package} title="Material not found" />
      </div>
    );
  }

  const totalQty = material.stockItems.reduce((s, si) => s + toNum(si.qty), 0);
  const totalValue = material.stockItems.reduce((s, si) => s + toNum(si.qty) * toNum(si.movingAvgCost), 0);

  return (
    <div>
      <MobileDetailHeader
        title={material.name}
        subtitle={material.code ?? "no code"}
        backHref="/m/stock"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Package} title="Category" value={material.category?.name ?? "—"} />
        <MobileInfoRow icon={Layers} title="Unit" value={material.unit} />
        {material.reorderPoint && (
          <MobileInfoRow icon={AlertTriangle} title="Reorder Point" value={formatNumber(toNum(material.reorderPoint))} />
        )}
        {material.isLotTracked && (
          <MobileInfoRow icon={Package} title="Lot Tracked" value="Yes" />
        )}
      </div>

      <MobileSectionTitle>Stock Summary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Total Stock"
          value={`${formatNumber(totalQty)} ${material.unit}`}
          icon={Package}
          tone="brand"
        />
        <MobileStatCard
          label="Total Value"
          value={formatCurrency(totalValue)}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Locations"
          value={String(material.stockItems.length)}
          icon={MapPin}
        />
        {totalQty <= (material.reorderPoint ? toNum(material.reorderPoint) : 0) && (
          <MobileStatCard
            label="Status"
            value="Low Stock"
            icon={TrendingDown}
            tone="warning"
          />
        )}
      </div>

      <MobileSectionTitle>Stock by Location</MobileSectionTitle>
      {material.stockItems.length === 0 ? (
        <MobileEmptyState icon={Package} title="No stock at any location" />
      ) : (
        <div>
          {material.stockItems.map((si) => (
            <MobileRow
              key={si.id}
              icon={MapPin}
              title={si.location.name}
              subtitle={`${formatNumber(toNum(si.qty))} ${material.unit} · ${formatCurrency(toNum(si.movingAvgCost))}/unit`}
              meta={formatCurrency(toNum(si.qty) * toNum(si.movingAvgCost))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
