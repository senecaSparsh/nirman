import { prisma } from "@nirman/db";
import { getCompany, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileSitePurchaseClient } from "./MobileSitePurchaseClient";

export const metadata = { title: "Site Purchase — Nirman" };

export default function MobileSitePurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; project?: string }>;
}) {
  return (
    <MobileNewEntityPage perm={PERM.INVENTORY_MANAGE} what="record a site purchase" permission="inventory.manage" fields={3} scopeAware>
      {async () => {
        const company = await getCompany();
        const { location: initialLocationId, project: initialProjectId } = await searchParams;

        const [suppliers, materials, locations, projects] = await Promise.all([
          prisma.supplier.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: 200,
          }),
          prisma.material.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, unit: true, hsnCode: true, gstRate: true },
            orderBy: { name: "asc" },
            take: 500,
          }),
          prisma.stockLocation.findMany({
            where: { ...await scopeWhere("StockLocation"), companyId: company.id, deletedAt: null, type: { in: ["PROJECT_SITE", "COMPANY_WAREHOUSE", "CENTRAL_WAREHOUSE"] } },
            select: { id: true, name: true, type: true, projectId: true },
            orderBy: { name: "asc" },
          }),
          prisma.project.findMany({
            where: { ...await scopeWhere("Project"), companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: 100,
          }),
        ]);

        return (
          <MobileSitePurchaseClient
            suppliers={suppliers}
            materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, gstRate: m.gstRate ? Number(m.gstRate) : null }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId }))}
            projects={projects}
            initialLocationId={initialLocationId ?? null}
            initialProjectId={initialProjectId ?? null}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
