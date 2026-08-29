import { prisma } from "@nirman/db";
import { getUserRole, getCompany, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewProcurementClient from "./MobileNewProcurementClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/procurement/new — mobile purchase order creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission and fetches
 * dropdown data (suppliers, projects, materials, stock locations) from
 * Prisma directly.
 */
export default async function MobileNewProcurementPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_MANAGE)) {
    return <MobileNoAccess what="create purchase orders" permission="procurement.manage" />;
  }

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
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
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
}
