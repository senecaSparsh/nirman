import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sales/new-options
 *
 * Returns all the reference data needed to render the mobile new-sale form
 * (available units, parcels, customers, projects, sellable projects, brokers).
 * Used by the FAB + modal pattern so the form can fetch its own data
 * client-side instead of requiring a server component page.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();

  const [units, parcels, customers, projects, allProjectsForSale, brokers] = await Promise.all([
    prisma.builtUnit.findMany({
      where: {
        ...await scopeWhere("BuiltUnit"),
        deletedAt: null,
        status: "AVAILABLE",
        project: { companyId: company.id, deletedAt: null },
      },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      take: 200,
      include: { project: { select: { id: true, name: true, reraNumber: true } } },
    }),
    prisma.landParcel.findMany({
      where: {
        ...await scopeWhere("LandParcel"),
        deletedAt: null,
        status: "AVAILABLE",
        landPurchase: { companyId: company.id },
      },
      orderBy: { number: "asc" },
      take: 200,
      include: {
        landPurchase: { select: { id: true, sellerName: true, location: true } },
        project: { select: { id: true, name: true, reraNumber: true } },
      },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Sellable projects: PLANNED/ACTIVE, all units AVAILABLE/HOLD with no sale
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: {
        id: true,
        name: true,
        builtUnits: { where: { deletedAt: null }, select: { id: true, status: true, saleId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.broker.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, agency: true, defaultCommissionPercent: true },
    }),
  ]);

  // Filter to only projects where ALL units are sellable (AVAILABLE/HOLD, no sale)
  const sellableProjects = allProjectsForSale
    .filter((p) => {
      const unitList = p.builtUnits;
      if (unitList.length === 0) return false;
      return unitList.every((u) =>
        (u.status === "AVAILABLE" || u.status === "HOLD") && u.saleId === null,
      );
    })
    .map((p) => ({ id: p.id, name: p.name }));

  const unitItems = units.map((u) => ({
    id: u.id,
    label: `${u.unitNumber} · ${u.unitType.replace(/_/g, " ")} · ${u.project.name}`,
    projectId: u.projectId,
    projectReraNumber: u.project.reraNumber ?? null,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
  }));

  const parcelItems = parcels.map((p) => ({
    id: p.id,
    label: `Parcel ${p.number} · ${p.landPurchase.location ?? p.landPurchase.sellerName}`,
    projectId: p.projectId,
    projectReraNumber: p.project?.reraNumber ?? null,
    askingPrice: null,
    area: toNum(p.area),
    areaUnit: p.areaUnit,
  }));

  const customerItems = customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  const existingPhones = customers.map((c) => c.phone).filter(Boolean) as string[];

  return json({
    units: unitItems,
    parcels: parcelItems,
    customers: customerItems,
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    sellableProjects,
    brokers: brokers.map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      agency: b.agency,
      defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
    })),
    existingPhones,
  });
});
