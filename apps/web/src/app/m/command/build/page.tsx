import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Building2, Wrench, Package, ScrollText } from "lucide-react";
import { getCompany } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileInfoRow, MobileEmptyState, MobileStatCard, MobileCta, MobileRefreshButton, MobileStatusBadge } from "@/components/mobile/mobile-primitives";

/** Ops → Build tab: projects + stock + equipment. */
export default function CommandBuildPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <CommandBuildContent />
    </Suspense>
  );
}

async function CommandBuildContent() {
  await connection();
  const company = await getCompany();

  const [projects, equipmentCount, stockLocations, equipment] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true, status: true, _count: { select: { builtUnits: true } } },
      take: 10,
      orderBy: { name: "asc" },
    }),
    prisma.equipment.count({ where: { companyId: company.id, deletedAt: null, status: { not: "RETIRED" } } }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true, _count: { select: { stockItems: true } } },
      take: 10,
      orderBy: { name: "asc" },
    }),
    prisma.equipment.findMany({
      where: { companyId: company.id, deletedAt: null, status: { not: "RETIRED" } },
      select: { id: true, name: true, status: true },
      take: 8,
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <MobilePageHeader title="Build" subtitle={`${projects.length} projects · ${equipmentCount} equipment`} right={<MobileRefreshButton />} />

      <div className="grid grid-cols-2 gap-2.5 p-4">
        <MobileStatCard label="Active Projects" value={formatNumber(projects.length, 0)} icon={Building2} />
        <MobileStatCard label="Equipment" value={formatNumber(equipmentCount, 0)} icon={Wrench} />
        <MobileStatCard label="Stock Locations" value={formatNumber(stockLocations.length, 0)} icon={Package} />
        <MobileStatCard label="Units" value={formatNumber(projects.reduce((s, p) => s + p._count.builtUnits, 0), 0)} icon={Building2} />
      </div>

      <MobileSectionTitle>Projects</MobileSectionTitle>
      {projects.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No active projects" />
      ) : (
        <div>
          {projects.map((p) => (
            <MobileRow key={p.id} href={`/m/projects/${p.id}`} icon={Building2} title={p.name} subtitle={`${p._count.builtUnits} units`} badge={<MobileStatusBadge status={p.status} />} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Stock Locations</MobileSectionTitle>
      {stockLocations.length === 0 ? (
        <MobileEmptyState icon={Package} title="No stock locations" />
      ) : (
        <div>
          {stockLocations.map((l) => (
            <MobileRow key={l.id} href={`/m/stock?locationId=${l.id}`} icon={Package} title={l.name} subtitle={`${l._count.stockItems} line items`} meta={l.type} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Equipment</MobileSectionTitle>
      {equipment.length === 0 ? (
        <MobileEmptyState icon={Wrench} title="No equipment" />
      ) : (
        <div>
          {equipment.map((e) => (
            <MobileInfoRow key={e.id} icon={Wrench} title={e.name} value="" badge={<MobileStatusBadge status={e.status} />} />
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        <MobileCta href="/m/stock" icon={ScrollText} variant="outline">
          Stock ledger
        </MobileCta>
      </div>
    </div>
  );
}
