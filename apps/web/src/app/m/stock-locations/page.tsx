import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileStockLocationsList } from "./MobileStockLocationsList";
import Decimal from "decimal.js";

/**
 * /m/stock-locations — list, create, edit, and delete stock locations.
 * Gates on INVENTORY_MANAGE for write actions; INVENTORY_VIEW for read.
 */
export default function MobileStockLocationsPage() {
  return (
    <MobileListPage perm={PERM.INVENTORY_VIEW} what="stock locations" permission="inventory.view" managePerm={PERM.INVENTORY_MANAGE}>
      {async ({ company, canManage }) => {
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

        return (
          <MobileStockLocationsList
            locations={rows}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            canManage={canManage}
          />
        );
      }}
    </MobileListPage>
  );
}
