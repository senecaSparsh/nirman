import { prisma } from "@nirman/db";
import { getUserRole, getCompany, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewProcurementClient from "./MobileNewProcurementClient";

/**
 * /m/procurement/new — mobile purchase order creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission and fetches
 * dropdown data (suppliers, projects, materials, stock locations) from
 * Prisma directly.
 */
export default async function MobileNewProcurementPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Purchase Order
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to create purchase orders.
        </p>
      </div>
    );
  }

  const company = await getCompany();

  const [suppliers, projects, materials, locations] = await Promise.all([
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
      select: { id: true, name: true, code: true, unit: true, gstRate: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true, projectId: true },
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
    })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId })),
  };

  return <MobileNewProcurementClient data={serialized} />;
}
