import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewProcurementClient from "./MobileNewProcurementClient";

/**
 * /m/procurement/new — mobile purchase order creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission and fetches
 * dropdown data (suppliers, projects, materials, stock locations) from
 * Prisma directly.
 */
export default function MobileNewProcurementPage() {
  return (
    <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="create purchase orders" permission="procurement.manage" fields={6}>
      {async () => {
        const company = await getCompany();

        const [suppliers, projects, materials, locations, categories] = await Promise.all([
          prisma.supplier.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, phone: true },
            orderBy: { name: "asc" },
          }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.material.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, code: true, unit: true, gstRate: true, barcode: true },
            orderBy: { name: "asc" },
          }),
          prisma.stockLocation.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, type: true, projectId: true },
            orderBy: { name: "asc" },
          }),
          prisma.materialCategory.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, unit: true, hsnCode: true, gstRate: true },
            orderBy: { name: "asc" },
          }).then((rows) => rows.map((c) => ({ ...c, gstRate: c.gstRate ? c.gstRate.toNumber() : null }))),
        ]);

        const serialized = {
          suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone })),
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
          materials: materials.map((m) => ({
            id: m.id,
            name: m.name,
            code: m.code,
            unit: m.unit,
            gstRate: toNum(m.gstRate),
            barcode: m.barcode,
          })),
          locations: locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId })),
          categories: categories.map((c) => ({ id: c.id, name: c.name, unit: c.unit })),
        };

        return <MobileNewProcurementClient data={serialized} />;
      }}
    </MobileNewEntityPage>
  );
}
