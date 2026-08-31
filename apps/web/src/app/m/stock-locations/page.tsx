import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { MobileStockLocationsList } from "./MobileStockLocationsList";

/**
 * /m/stock-locations — list, create, edit, and delete stock locations.
 * Gates on INVENTORY_MANAGE for write actions; INVENTORY_VIEW for read.
 */
export default async function MobileStockLocationsPage() {
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) notFound();
  await connection();

  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (!company) notFound();

  const locations = await prisma.stockLocation.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      project: { select: { name: true } },
      stockItems: { select: { qty: true, movingAvgCost: true } },
    },
  });

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const rows = locations.map((l) => {
    const stockValue = l.stockItems.reduce(
      (s, i) => s.plus(new Decimal(i.qty).times(new Decimal(i.movingAvgCost))),
      new Decimal(0),
    );
    return {
      id: l.id,
      type: l.type,
      name: l.name,
      address: l.address,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      lat: l.lat,
      lng: l.lng,
      geoRadius: l.geoRadius,
      itemCount: l.stockItems.length,
      stockValue: stockValue.toNumber(),
    };
  });

  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);

  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <MobileStockLocationsList
        locations={rows}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManage}
      />
    </Suspense>
  );
}
