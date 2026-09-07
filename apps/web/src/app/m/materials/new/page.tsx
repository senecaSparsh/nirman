import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewMaterialClient from "./MobileNewMaterialClient";

/**
 * /m/materials/new — create a new material from mobile.
 * Gates on INVENTORY_MANAGE permission.
 */
export default function NewMaterialPage() {
  return (
    <MobileNewEntityPage perm={PERM.INVENTORY_MANAGE} what="add materials" permission="inventory.manage" fields={5}>
      {async () => {
        // Fetch categories for the dropdown
        const categories = await prisma.materialCategory.findMany({
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true },
        });

        return <MobileNewMaterialClient categories={categories} />;
      }}
    </MobileNewEntityPage>
  );
}
