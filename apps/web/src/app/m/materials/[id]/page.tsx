import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, AlertTriangle, ArrowLeftRight, Truck } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileInfoRow,
  MobileCta,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/materials/[id] — material detail: cost, stock by location, recent
 * movements, and quick links to the stock ledger filtered by this material.
 */
export default function MobileMaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileMaterialDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMaterialDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const [material, stockItems, movements] = await Promise.all([
    prisma.material.findFirst({
      where: { id, deletedAt: null },
      include: { category: { select: { name: true } } },
    }),
    prisma.stockLocationItem.findMany({
      where: { materialId: id, location: { companyId: company.id } },
      include: { location: { select: { id: true, name: true, type: true } } },
      orderBy: { location: { name: "asc" } },
    }),
    prisma.stockMovement.findMany({
      where: {
        materialId: id,
        OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }],
      },
      orderBy: { timestamp: "desc" },
      take: 15,
      include: { fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } },
    }),
  ]);

  if (!material) {
    return (
      <div>
        <MobileDetailHeader title="Material" backHref="/m/materials" />
        <MobileEmptyState icon={Package} title="Material not found" />
      </div>
    );
  }

  const totalQty = stockItems.reduce((s, i) => s + toNum(i.qty), 0);
  const totalValue = stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  const minStock = material.minStock ? toNum(material.minStock) : null;
  const isLow = minStock != null && totalQty < minStock;

  return (
    <div>
      <MobileDetailHeader
        title={material.name}
        subtitle={`${material.code} · ${material.category.name}`}
        backHref="/m/materials"
      />

      {/* ── Key facts ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-label text-muted-foreground/75">On Hand</div>
          <div className={`mt-1 text-[15px] font-semibold tnum ${isLow ? "text-danger" : "text-foreground"}`}>
            {formatNumber(totalQty, 0)} {material.unit}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-label text-muted-foreground/75">Stock Value</div>
          <div className="mt-1 text-[15px] font-semibold tnum text-foreground">{formatCurrency(totalValue)}</div>
        </div>
      </div>

      {isLow && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Below minimum stock ({formatNumber(minStock!, 0)} {material.unit})
        </div>
      )}

      {/* ── Cost & reorder ────────────────────────────────────── */}
      <MobileSectionTitle>Costing & Reorder</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Package} title="Standard cost" value={formatCurrency(toNum(material.standardCost))} />
        <MobileInfoRow icon={Package} title="Current cost (MAC)" value={formatCurrency(toNum(material.currentCost))} />
        {minStock != null && <MobileInfoRow icon={AlertTriangle} title="Minimum stock" value={`${formatNumber(minStock, 0)} ${material.unit}`} />}
        {material.reorderPoint && (
          <MobileInfoRow icon={Truck} title="Reorder point" value={`${formatNumber(toNum(material.reorderPoint), 0)} ${material.unit}`} />
        )}
        {material.economicOrderQty && (
          <MobileInfoRow icon={Truck} title="Economic order qty" value={`${formatNumber(toNum(material.economicOrderQty), 0)} ${material.unit}`} />
        )}
      </div>

      {/* ── Stock by location ─────────────────────────────────── */}
      <MobileSectionTitle>Stock by Location</MobileSectionTitle>
      {stockItems.length === 0 ? (
        <MobileEmptyState icon={Package} title="None on hand" />
      ) : (
        <div>
          {stockItems.map((i) => (
            <MobileRow
              key={i.id}
              href={`/m/stock?locationId=${i.locationId}`}
              icon={Package}
              title={i.location.name}
              subtitle={`MAC ${formatCurrency(toNum(i.movingAvgCost))}`}
              meta={`${formatNumber(toNum(i.qty), 0)} ${material.unit}`}
            />
          ))}
        </div>
      )}

      {/* ── Recent movements ──────────────────────────────────── */}
      <MobileSectionTitle>Recent Movements</MobileSectionTitle>
      {movements.length === 0 ? (
        <MobileEmptyState icon={ArrowLeftRight} title="No movements yet" />
      ) : (
        <div>
          {movements.map((m) => (
            <MobileInfoRow
              key={m.id}
              icon={ArrowLeftRight}
              title={`${m.fromLocation?.name ?? "—"} → ${m.toLocation?.name ?? "—"}`}
              value={`${formatNumber(toNum(m.qty), 0)} ${material.unit} · ${formatDate(m.timestamp)}`}
            />
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        <MobileCta href={`/m/stock?materialId=${material.id}`} icon={ArrowLeftRight} variant="outline">
          Full movement ledger
        </MobileCta>
      </div>
    </div>
  );
}
