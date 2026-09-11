import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { getCompany, getCompanyGroupIds } from "@/lib/server";
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
        const company = await getCompany();
        const groupIds = await getCompanyGroupIds(company);

        const [projects, companies] = await Promise.all([
          prisma.project.findMany({
            where: { deletedAt: null, companyId: { in: groupIds } },
            orderBy: { name: "asc" },
            select: { id: true, name: true, companyId: true },
          }),
          prisma.company.findMany({
            where: { id: { in: groupIds }, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, parentCompanyId: true },
          }),
        ]);

        return (
          <MobileNewStockLocationClient
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            companies={companies.map((c) => ({ id: c.id, name: c.name, isParent: !c.parentCompanyId }))}
            currentCompanyId={company.id}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
