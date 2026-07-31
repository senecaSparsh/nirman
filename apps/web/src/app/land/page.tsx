import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { LandView } from "@/components/land/land-view";
import { PageLoading } from "@/components/page-loading";
import type { LandPurchaseRow, LandParcelRow, ProjectOption } from "@/lib/types";

export default function LandPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Land"
        description="Land purchases, parcels, partitioning, and valuation."
      />
      <Suspense fallback={<PageLoading label="Loading land…" />}>
        <LandContent />
      </Suspense>
    </div>
  );
}

async function LandContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
    canPartition: hasPermission(role, PERM.LAND_PARTITION),
  };

  const [purchases, parcels, projects] = await Promise.all([
    prisma.landPurchase.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        parcels: { where: { deletedAt: null }, select: { id: true, area: true, status: true } },
      },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id } },
      orderBy: [{ landPurchaseId: "asc" }, { number: "asc" }],
      include: { project: { select: { name: true } }, parentParcel: { select: { number: true } }, _count: { select: { children: true } } },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  const purchaseRows: LandPurchaseRow[] = purchases.map((lp) => ({
    id: lp.id,
    projectId: lp.projectId,
    projectName: lp.project?.name ?? null,
    sellerName: lp.sellerName,
    sellerContact: lp.sellerContact,
    purchaseDate: lp.purchaseDate.toISOString(),
    totalArea: toNum(lp.totalArea),
    areaUnit: lp.areaUnit,
    totalCost: toNum(lp.totalCost),
    registryNo: lp.registryNo,
    location: lp.location,
    parcelCount: lp.parcels.length,
    availableArea: lp.parcels.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + toNum(p.area), 0),
  }));

  const parcelRows: LandParcelRow[] = parcels.map((p) => ({
    id: p.id,
    landPurchaseId: p.landPurchaseId,
    parentParcelId: p.parentParcelId,
    parentParcelNumber: p.parentParcel?.number ?? null,
    number: p.number,
    area: toNum(p.area),
    areaUnit: p.areaUnit,
    status: p.status,
    acquisitionCost: toNum(p.acquisitionCost),
    askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
    currentValuation: toNum(p.currentValuation),
    projectId: p.projectId,
    projectName: p.project?.name ?? null,
    childCount: p._count.children,
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  return (
    <LandView purchases={purchaseRows} parcels={parcelRows} projects={projectOptions} permissions={perms} />
  );
}
