import { prisma } from "@nirman/db";
import { getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewRequisitionClient } from "./MobileNewRequisitionClient";

export default function MobileNewRequisitionPage() {
  return (
    <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="create material indents" permission="procurement.manage" fields={4}>
      {async () => {
        const company = await getCompany();

        const [projects, materials, suppliers] = await Promise.all([
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.material.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, code: true, unit: true },
            orderBy: { name: "asc" },
          }),
          prisma.supplier.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ]);

        const serialized = {
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
          materials: materials.map((m) => ({
            id: m.id,
            name: m.name,
            code: m.code,
            unit: m.unit,
          })),
          suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
        };

        return <MobileNewRequisitionClient data={serialized} />;
      }}
    </MobileNewEntityPage>
  );
}
