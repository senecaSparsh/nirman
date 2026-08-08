import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Home, ShoppingCart } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { getUserRole } from "@/lib/server";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/units/[id] — built-unit detail with valuation, production cost, and
 * a "Sell this unit" CTA that links to the mobile new-sale form pre-seeded
 * with this unit.
 */
export default function MobileUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileUnitDetailContent params={params} />
    </Suspense>
  );
}

async function MobileUnitDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const unit = await prisma.builtUnit.findFirst({
    where: { id, deletedAt: null, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { name: true } },
    },
  });

  if (!unit) {
    return (
      <div>
        <MobileDetailHeader title="Unit" backHref="/m/units" right={<MobileRefreshButton />} />
        <MobileEmptyState icon={Home} title="Unit not found" />
      </div>
    );
  }

  const canSell = hasPermission(role, PERM.SALE_CREATE);
  const isSellable = unit.status === "AVAILABLE";

  return (
    <div>
      <MobileDetailHeader
        title={`${unit.unitNumber} · ${unit.unitType.replace(/_/g, " ")}`}
        subtitle={unit.project.name}
        backHref="/m/units"
        right={
          <div className="flex items-center gap-1">
            <MobileStatusBadge status={unit.status} />
            <MobileRefreshButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-label text-muted-foreground/75">Area</div>
          <div className="mt-1 text-[15px] font-semibold tnum text-foreground">
            {formatNumber(toNum(unit.area), 0)} {unit.areaUnit}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-label text-muted-foreground/75">Asking Price</div>
          <div className="mt-1 text-[15px] font-semibold tnum text-foreground">
            {unit.askingPrice ? formatCurrency(toNum(unit.askingPrice)) : "—"}
          </div>
        </div>
      </div>

      <MobileSectionTitle>Project</MobileSectionTitle>
      <div>
        <MobileRow
          href={`/m/projects/${unit.project.id}`}
          icon={Home}
          title={unit.project.name}
          subtitle="View project"
        />
      </div>

      <MobileSectionTitle>Valuation &amp; Cost</MobileSectionTitle>
      <div>
        <MobileInfoRow title="Asking price" value={unit.askingPrice ? formatCurrency(toNum(unit.askingPrice)) : "—"} />
        <MobileInfoRow title="Current valuation" value={formatCurrency(toNum(unit.currentValuation))} />
        <MobileInfoRow title="Production cost" value={formatCurrency(toNum(unit.productionCost))} />
        <MobileInfoRow title="NRV write-down" value={formatCurrency(toNum(unit.nrvWriteDown))} />
        {unit.floor != null && <MobileInfoRow title="Floor" value={String(unit.floor)} />}
        {unit.wing && <MobileInfoRow title="Wing" value={unit.wing} />}
        {unit.phase && <MobileInfoRow title="Phase" value={unit.phase.name} />}
      </div>

      {isSellable && canSell && (
        <div className="space-y-2 px-4 pb-6 pt-3">
          <MobileCta href={`/m/sales/new?builtUnitId=${unit.id}`} icon={ShoppingCart}>
            Sell this unit
          </MobileCta>
        </div>
      )}
      {unit.status === "SOLD" && (
        <div className="px-4 pb-6 pt-3">
          <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-meta text-success">
            This unit is sold.
          </div>
        </div>
      )}
    </div>
  );
}
