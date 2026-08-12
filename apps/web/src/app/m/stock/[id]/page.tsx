import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, MapPin, IndianRupee, AlertTriangle, Layers, TrendingDown } from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";

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
        <div className="mb-4">
          <MobileBackButton fallback="/m/stock" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <MobileEmptyState icon={Package} title="Material not found" />
      </div>
    );
  }

  const totalQty = material.stockItems.reduce((s, si) => s + toNum(si.qty), 0);
  const totalValue = material.stockItems.reduce((s, si) => s + toNum(si.qty) * toNum(si.movingAvgCost), 0);

  return (
    <div>
      <div className="mb-4">
        <MobileBackButton fallback="/m/stock" className="gap-1 text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }} />
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow icon={Package} title="Category" meta={material.category?.name ?? "—"} />
        <MobileRow icon={Layers} title="Unit" meta={material.unit} />
        {material.reorderPoint && (
          <MobileRow icon={AlertTriangle} title="Reorder Point" meta={formatNumber(toNum(material.reorderPoint))} />
        )}
        {material.isLotTracked && (
          <MobileRow icon={Package} title="Lot Tracked" meta="Yes" />
        )}
      </div>

      <MobileSectionTitle>Stock Summary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label="Total Stock"
          value={`${formatNumber(totalQty)} ${material.unit}`}
          icon={Package}
          tone="signal"
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
            tone="signal"
          />
        )}
      </div>

      <MobileSectionTitle>Stock by Location</MobileSectionTitle>
      {material.stockItems.length === 0 ? (
        <MobileEmptyState icon={Package} title="No stock at any location" />
      ) : (
        <div className="flex flex-col gap-2.5">
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
