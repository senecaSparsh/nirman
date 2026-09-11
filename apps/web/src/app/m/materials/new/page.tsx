import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { getCompany } from "@/lib/server";
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
        const company = await getCompany();
        // Fetch categories + stock locations for the dropdowns (company-scoped)
        const [categories, locations] = await Promise.all([
          prisma.materialCategory.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, unit: true, hsnCode: true, gstRate: true },
          }),
          prisma.stockLocation.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: [{ type: "asc" }, { name: "asc" }],
            select: { id: true, name: true, type: true, project: { select: { name: true } } },
          }),
        ]);

        return (
          <MobileNewMaterialClient
            categories={categories.map((c) => ({ ...c, gstRate: c.gstRate ? c.gstRate.toNumber() : null }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name, projectName: l.project?.name ?? null }))}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
