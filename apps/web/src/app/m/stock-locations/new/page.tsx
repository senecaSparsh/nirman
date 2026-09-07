import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewStockLocationClient from "./MobileNewStockLocationClient";

/**
 * /m/stock-locations/new — create a new stock location (warehouse or site).
 * Gates on INVENTORY_MANAGE permission.
 */
export default function NewStockLocationPage() {
  return (
    <MobileNewEntityPage perm={PERM.INVENTORY_MANAGE} what="add stock locations" permission="inventory.manage" fields={4}>
      {async () => {
        const projects = await prisma.project.findMany({
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        });

        return <MobileNewStockLocationClient projects={projects} />;
      }}
    </MobileNewEntityPage>
  );
}
